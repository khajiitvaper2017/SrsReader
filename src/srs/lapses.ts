import { db } from "@/platform/database/db";

export async function recalculateLapses(cardIds: string[]) {
  if (!cardIds.length) return;
  const reviews = await db.reviews
    .where("cardId")
    .anyOf(cardIds)
    .filter((review) => review.active)
    .toArray();
  if (!reviews.length) return;
  reviews.sort((a, b) => a.time - b.time || a.sequence - b.sequence);
  const missingState = reviews.filter(
    (review) =>
      review.before?.schedule?.state === undefined &&
      review.fsrsLog?.state === undefined,
  );
  const original = new Map(
    (
      await db.ankiReviews.bulkGet(missingState.map((review) => review.id))
    ).flatMap((review) => (review ? [[review.id, review] as const] : [])),
  );
  const totals = new Map<string, number>();
  for (const review of reviews) {
    const before = review.before?.schedule;
    if (
      !totals.has(review.cardId) ||
      (review.before && (!before || before.state === 0))
    )
      totals.set(review.cardId, before?.lapses ?? 0);
    const state =
      before?.state ??
      review.fsrsLog?.state ??
      (original.get(review.id)?.data.type === 1 ? 2 : undefined);
    if (state === 2 && review.rating === 1)
      totals.set(review.cardId, totals.get(review.cardId)! + 1);
  }
  const changed = (await db.cards.bulkGet([...totals.keys()])).flatMap(
    (card) => {
      if (!card?.schedule || card.schedule.lapses === totals.get(card.id))
        return [];
      return [
        {
          ...card,
          schedule: { ...card.schedule, lapses: totals.get(card.id)! },
          version: card.version + 1,
          srsVersion: card.srsVersion + 1,
        },
      ];
    },
  );
  if (changed.length)
    await db.transaction("rw", [db.cards, db.srsMeta], async () => {
      await db.cards.bulkPut(changed);
      await db.srsMeta.update("main", { undo: undefined });
    });
}
