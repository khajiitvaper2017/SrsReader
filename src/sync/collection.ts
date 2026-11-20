import { z } from "zod";
import { learningRowsSchema, validateLearningRows } from "@/backups/archive";
import { audioInfoSchema } from "@/audio/model";
import { assetId, cardAssetSchema } from "@/cards/model";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { defaults, settingsSchema } from "@/settings/model";
import { saveSettings } from "@/settings/store";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { applyMediaList, prepareMedia } from "@/sync/media";
import { outgoingHashes, putSyncBatches } from "@/sync/metadata";
import { type CollectionBase, mediaKey } from "@/sync/model";
import { portableSettings, applyPortableSettings } from "@/sync/settings";
import {
  discardStagedAnkiMedia,
  localVersions,
  withoutSyncTracking,
} from "@/sync/tracking";
import { mediaHash } from "@/sync/transfer";
import Dexie from "dexie";

const mediaFields = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  mime: z.string(),
});
const schema = learningRowsSchema.extend({
  format: z.literal("srs-reader-collection"),
  version: z.literal(1),
  settings: z.record(z.string(), z.unknown()),
  media: z.array(
    z.discriminatedUnion("table", [
      mediaFields.extend({ table: z.literal("audio"), data: audioInfoSchema }),
      mediaFields.extend({
        table: z.literal("cardAssets"),
        data: cardAssetSchema
          .omit({ blob: true })
          .refine((row) => row.id === assetId(row.namespace, row.name)),
      }),
    ]),
  ),
});
const studyTables = [
  "vocabulary",
  "noteTypes",
  "notes",
  "cards",
  "decks",
  "sentences",
  "reviews",
  "ankiReviews",
] as const;
export const outgoingId = "collection-outgoing";
const studyStores = studyTables.map((name) => db[name]);

export async function collectionIsEmpty() {
  for (const name of [...studyTables, "audio", "cardAssets"] as const)
    if (await db[name].count()) return false;
  return true;
}

export async function clearOutgoing() {
  await db.transaction("rw", db.syncMeta, async () => {
    await db.syncMeta.delete(outgoingId);
    await db.syncMeta.where("id").startsWith(outgoingHashes).delete();
  });
}

export async function captureCollection(
  account: string,
  parents: string[],
  generation: number,
  mediaGeneration: number,
  includeMediaHashes: boolean,
) {
  const data = await srsWrite(async () => {
    await discardStagedAnkiMedia();
    await prepareMedia();
    return db.transaction(
      "r",
      [...studyStores, db.syncMedia, db.syncMeta, db.settings],
      async () => {
        if (generation !== (await localVersions()).generation)
          throw new Error("sync_collection_changed");
        const media = (await db.syncMedia.toArray()).map(({ item }) => {
          if (!item) throw new Error("sync_collection_changed");
          return item;
        });
        return {
          format: "srs-reader-collection",
          version: 1,
          settings: portableSettings(
            settingsSchema.parse(
              (await db.settings.get("main"))?.value ?? defaults,
            ),
          ),
          vocabulary: await db.vocabulary.toArray(),
          noteTypes: await db.noteTypes.toArray(),
          notes: await db.notes.toArray(),
          cards: await db.cards.toArray(),
          decks: await db.decks.toArray(),
          sentences: await db.sentences.toArray(),
          reviews: await db.reviews.toArray(),
          ankiReviews: await db.ankiReviews.toArray(),
          media,
        };
      },
    );
  });
  const blob = await new Response(
    new Blob([JSON.stringify(data)])
      .stream()
      .pipeThrough(new CompressionStream("gzip")),
  ).blob();
  const hash = await mediaHash(blob);
  await db.transaction("rw", db.syncMeta, async () => {
    await clearOutgoing();
    if (includeMediaHashes)
      await putSyncBatches(
        db.syncMeta,
        [...new Set(data.media.map(({ hash }) => hash))].map((hash) => ({
          id: outgoingHashes + hash,
        })),
      );
    await db.syncMeta.put({
      id: outgoingId,
      account,
      parents,
      generation,
      mediaGeneration,
      blob,
      hash,
      name: `collection.${crypto.randomUUID()}.json.gz`,
    });
  });
}

export async function applyCollection(
  source: Blob,
  hash: string,
  base: CollectionBase,
) {
  if ((await mediaHash(source)) !== hash)
    throw new Error("sync_invalid_snapshot");
  const decoded = await new Response(
    source.stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();
  const data = schema.parse(JSON.parse(decoded));
  validateLearningRows(data);
  if (
    new Set(data.media.map((item) => mediaKey(item.table, item.data.id)))
      .size !== data.media.length
  )
    throw new Error("sync_invalid_media");
  await srsWrite(async () => {
    await discardStagedAnkiMedia();
    await prepareMedia();
    await db.transaction(
      "rw",
      [
        ...studyStores,
        db.syncMedia,
        db.audio,
        db.cardAssets,
        db.syncMeta,
        db.settings,
        db.dictionaries,
        db.srsMeta,
        db.rwkvMeta,
        db.rwkvCards,
        db.rwkvEntities,
      ],
      () =>
        withoutSyncTracking(async () => {
          if (base.generation !== (await localVersions()).generation)
            throw new Error("sync_collection_changed");
          const current = settingsSchema.parse(
            (await db.settings.get("main"))?.value ?? defaults,
          );
          const settings = await Dexie.waitFor(
            applyPortableSettings(current, data.settings),
          );
          for (const table of studyTables) {
            // Dexie needs each concrete table's row type when writing a union of tables.
            const rows = db.table<(typeof data)[typeof table][number], string>(
              table,
            );
            await rows.clear();
            await putSyncBatches(rows, data[table]);
          }
          await applyMediaList(data.media);
          await saveSettings(settings);
          for (const [id, preference] of Object.entries(
            settings.dictionaryPreferences,
          ))
            await db.dictionaries.update(id, {
              enabled: preference.enabled,
              order: preference.order,
            });
          await db.srsMeta.put({
            id: "main",
            sequence: data.reviews.reduce(
              (max, row) => Math.max(max, row.sequence),
              0,
            ),
          });
          await invalidateRwkv();
          await db.syncMeta.put(base);
        }),
    );
  });
}
