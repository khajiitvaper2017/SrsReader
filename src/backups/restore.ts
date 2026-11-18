import { saveSettings } from "@/settings/store";
import { readLearning } from "@/backups/archive";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { settingsSchema } from "@/settings/model";
import { srsClient } from "@/srs/client";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { discardStagedAnkiMedia, withRestoredTracking } from "@/sync/tracking";
import type { Table } from "dexie";

export async function restoreSettings(
  settings: ReturnType<typeof settingsSchema.parse>,
) {
  await srsWrite(() =>
    db.transaction("rw", [db.settings, db.dictionaries], () =>
      withRestoredTracking(async () => {
        const current = (await db.settings.get("main"))?.value;
        await saveSettings({
          ...settings,
          algorithm: current?.algorithm ?? "fsrs",
        });
        for (const [id, preference] of Object.entries(
          settings.dictionaryPreferences,
        ))
          await db.dictionaries.update(id, {
            enabled: preference.enabled,
            order: preference.order,
          });
      }),
    ),
  );
  if (settings.algorithm === "rwkv") {
    while (!(await srsClient({ action: "rwkvStatus" })).ready)
      await srsClient({ action: "prepareRwkv" });
  }
  await srsClient({
    action: "activateAlgorithm",
    algorithm: settings.algorithm,
  });
}

export async function restoreLearning(
  data: Awaited<ReturnType<typeof readLearning>>,
) {
  await srsWrite(async () => {
    await discardStagedAnkiMedia();
    return db.transaction(
      "rw",
      [
        db.vocabulary,
        db.reviews,
        db.audio,
        db.noteTypes,
        db.notes,
        db.cards,
        db.cardAssets,
        db.ankiReviews,
        db.decks,
        db.sentences,
        db.srsMeta,
        db.rwkvMeta,
        db.rwkvEntities,
        db.rwkvCards,
      ],
      () =>
        withRestoredTracking(async () => {
          await invalidateRwkv();
          await db.srsMeta.put({
            id: "main",
            sequence: data.reviews.reduce(
              (max, review) => Math.max(max, review.sequence),
              0,
            ),
          });
          await replaceLearningRows(db.vocabulary, data.vocabulary);
          await replaceLearningRows(db.reviews, data.reviews);
          await replaceLearningRows(db.audio, data.audio);
          await replaceLearningRows(db.noteTypes, data.noteTypes);
          await replaceLearningRows(db.notes, data.notes);
          await replaceLearningRows(db.cards, data.cards);
          await replaceLearningRows(db.cardAssets, data.cardAssets);
          await replaceLearningRows(db.ankiReviews, data.ankiReviews);
          await replaceLearningRows(db.decks, data.decks);
          await replaceLearningRows(db.sentences, data.sentences);
        }),
    );
  });
}

// Diff instead of clearing first: restoring identical rows must not turn them
// into a delete/re-add or erase the observed causal history of an actual edit.
async function replaceLearningRows<T extends { id: string }>(
  table: Table<T, string>,
  rows: T[],
) {
  const incoming = new Set(rows.map((row) => row.id));
  const removed = (await table.toCollection().primaryKeys()).filter(
    (id) => !incoming.has(id),
  );
  if (removed.length) await table.bulkDelete(removed);
  if (rows.length) await table.bulkPut(rows);
}
