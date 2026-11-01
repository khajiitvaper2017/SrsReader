import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { entityKey } from "@/srs/engines/rwkv/model";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";

export async function undoReview(id: string) {
  return db.transaction(
    "rw",
    [
      db.cards,
      db.reviews,
      db.srsMeta,
      db.rwkvMeta,
      db.rwkvEntities,
      db.rwkvCards,
    ],
    async () => {
      const review = await db.reviews.get(id);
      const last = await db.reviews
        .orderBy("sequence")
        .reverse()
        .filter((review) => review.active)
        .first();
      if (!review?.active || last?.id !== id)
        throw new Error(t("undo_latest_only"));
      const current = await db.cards.get(review.cardId);
      if (!current || current.srsVersion !== review.afterSrsVersion)
        throw new Error(t("this_word_changed_after_that_review_and_cannot"));
      await db.cards.put({
        ...current,
        schedule: review.before?.schedule ?? null,
        suspended: review.before?.suspended ?? false,
        leech: review.before?.leech ?? false,
        srsVersion: current.srsVersion + 1,
        version: current.version + 1,
        updated: Date.now(),
      });
      await db.reviews.update(id, { active: false });
      const meta = await db.srsMeta.get("main");
      if (meta?.undo?.reviewId === id) {
        const undo = meta.undo;
        const ids = [
          review.cardId,
          current.language,
          review.cardId,
          "main",
          "main",
        ];
        await db.rwkvEntities.bulkDelete(
          ids.map((id, stream) => entityKey(stream, id)),
        );
        await db.rwkvEntities.bulkPut(undo.entities);
        if (undo.card) await db.rwkvCards.put(undo.card);
        else await db.rwkvCards.delete(review.cardId);
        await db.rwkvMeta.put({ ...undo.meta, cursor: meta.sequence });
      } else await invalidateRwkv();
      if (meta) await db.srsMeta.put({ ...meta, undo: undefined });
      return review.wordId;
    },
  );
}
