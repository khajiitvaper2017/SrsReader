import type { SchedulingPreferences } from "@/srs/preferences";
import { dayStart, studyDay } from "@/srs/study-day";
import type { ReviewWord } from "@/vocabulary/model";
import { mergeQueues, queueRandom } from "@/srs/queue-order";

export function buildQueue<T extends Pick<ReviewWord, "id" | "card">>(
  words: T[],
  counts: { today: number; introduced: number; reviews: number },
  settings: SchedulingPreferences,
  now: number,
  orderedNew: T[],
  deckOrder: ReadonlyMap<string, number> = new Map(),
  withinDeckLimit?: (
    id: string,
    kind: "fresh" | "reviews",
    consume: boolean,
  ) => boolean,
) {
  const available = Math.max(
    0,
    (settings.reviewLimit ?? Infinity) - counts.reviews,
  );
  const byDue = (a: T, b: T) =>
    a.card!.dueAt - b.card!.dueAt || a.id.localeCompare(b.id);
  const day = studyDay(now, settings.rolloverHour);
  const byRandom = (a: T, b: T) =>
    queueRandom(a.id, day) - queueRandom(b.id, day) || a.id.localeCompare(b.id);
  const byDeck = (a: T, b: T) =>
    (deckOrder.get(a.id) ?? 0) - (deckOrder.get(b.id) ?? 0);
  const byDueDay = (a: T, b: T) =>
    studyDay(a.card!.dueAt, settings.rolloverHour) -
    studyDay(b.card!.dueAt, settings.rolloverHour);
  const reviewOrder = {
    due: byDue,
    due_random: (a: T, b: T) => byDueDay(a, b) || byRandom(a, b),
    due_deck: (a: T, b: T) => byDueDay(a, b) || byDeck(a, b) || byDue(a, b),
    deck_due: (a: T, b: T) => byDeck(a, b) || byDue(a, b),
    interval_asc: (a: T, b: T) =>
      a.card!.scheduledDays - b.card!.scheduledDays || byDue(a, b),
    interval_desc: (a: T, b: T) =>
      b.card!.scheduledDays - a.card!.scheduledDays || byDue(a, b),
    random: byRandom,
  };
  const learning = words
    .filter(
      (word) =>
        (word.card!.state === 1 || word.card!.state === 3) &&
        !word.card!.interday &&
        word.card!.dueAt <= now,
    )
    .sort(byDue);
  function take(entries: T[], limit: number, kind: "fresh" | "reviews") {
    if (!withinDeckLimit) return entries.slice(0, limit);
    const selected: T[] = [];
    for (const word of entries) {
      if (selected.length === limit) break;
      if (withinDeckLimit(word.id, kind, true)) selected.push(word);
    }
    return selected;
  }
  const interdayDue = words
    .filter((word) => word.card!.interday && word.card!.dueAt <= now)
    .sort(byDue);
  const interday = take(interdayDue, available, "reviews");
  const reviewsDue = words
    .filter((word) => word.card!.state === 2 && word.card!.dueAt <= now)
    .sort(reviewOrder[settings.reviewSortOrder]);
  const reviews = take(
    reviewsDue,
    Math.max(0, available - interday.length),
    "reviews",
  );
  const scheduled = mergeQueues(
    interday,
    reviews,
    settings.interdayReviewOrder,
    day,
  );
  const due = [...learning, ...scheduled];
  const fresh =
    available > 0
      ? take(
          orderedNew,
          Math.max(0, settings.newLimit - counts.introduced),
          "fresh",
        )
      : [];
  if (settings.newSortOrder === "random")
    fresh.sort(
      (a, b) =>
        queueRandom(a.id, day + 1) - queueRandom(b.id, day + 1) ||
        a.id.localeCompare(b.id),
    );
  const future = words
    .filter(
      (word) =>
        (word.card!.state === 1 || word.card!.state === 3) &&
        !word.card!.interday &&
        word.card!.dueAt > now,
    )
    .sort(byDue);
  const ahead =
    due.length || fresh.length
      ? []
      : future.filter(
          (word) =>
            word.card!.dueAt <= now + settings.learnAheadMinutes * 60000,
        );
  const rollover = dayStart(
    studyDay(now, settings.rolloverHour) + 1,
    settings.rolloverHour,
  );
  const waiting = Math.min(
    rollover,
    ...future.map((word) =>
      Math.max(
        now + 500,
        word.card!.dueAt - settings.learnAheadMinutes * 60000,
      ),
    ),
  );
  const queued = [
    ...learning,
    ...mergeQueues(fresh, scheduled, settings.newReviewOrder, day + 1),
    ...ahead,
  ];
  return {
    words: queued,
    learning: queued.filter((word) => word.card!.state === 1).length,
    relearning: queued.filter((word) => word.card!.state === 3).length,
    reviews: queued.filter((word) => word.card!.state === 2).length,
    ahead: ahead.length,
    due: due.length,
    fresh: fresh.length,
    waiting: future.length ? waiting : null,
    wakeAt: waiting,
    canStudyMore: words.some((word) =>
      word.card!.state === 0
        ? (withinDeckLimit?.(word.id, "fresh", false) ?? true)
        : (word.card!.state === 2 || word.card!.interday) &&
          word.card!.dueAt <= now &&
          (withinDeckLimit?.(word.id, "reviews", false) ?? true),
    ),
  };
}
