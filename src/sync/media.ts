import { db } from "@/platform/database/db";
import { mediaLinkPrefix } from "@/platform/database/media-links";
import { mediaKey, type MediaIndexRow, type MediaItem } from "@/sync/model";
import { withoutSyncTracking } from "@/sync/tracking";
import { outgoingHashes, putSyncBatches } from "@/sync/metadata";
import { mediaHash } from "@/sync/transfer";

export const mediaTables = ["audio", "cardAssets"] as const;
export const contentPrefix = mediaLinkPrefix + "sha256:";
export const uploadPrefix = "collection-media-upload:";

export function indexRow(item: MediaItem, missing?: 1): MediaIndexRow {
  return {
    table: item.table,
    key: mediaKey(item.table, item.data.id),
    id: item.data.id,
    hash: item.hash,
    item,
    missing,
  };
}

export async function saveContent(hash: string, blob: Blob) {
  const id = contentPrefix + hash;
  if (!(await db.syncMeta.where("id").equals(id).count()))
    await db.syncMeta.put({ id, blob });
}

async function putMedia(item: MediaItem) {
  const blob = { syncMedia: contentPrefix + item.hash, mime: item.mime };
  if (item.table === "audio") await db.audio.put({ ...item.data, blob });
  else await db.cardAssets.put({ ...item.data, blob });
}

// Called under the SRS lock. Each file write commits before the next one.
export async function prepareMedia() {
  await db.transaction(
    "rw",
    [db.syncMeta, db.syncMedia, db.audio, db.cardAssets],
    async () => {
      if (await db.syncMeta.get("collection-media-index")) return;
      for (const table of mediaTables) {
        const keys = await db[table].toCollection().primaryKeys();
        const indexed = new Set(
          await db.syncMedia.where("table").equals(table).primaryKeys(),
        );
        await putSyncBatches(
          db.syncMedia,
          keys
            .filter((id) => !indexed.has(mediaKey(table, id)))
            .map((id) => ({
              key: mediaKey(table, id),
              table,
              id,
              generation: 0,
            })),
        );
      }
      await db.syncMeta.bulkPut([
        { id: "collection-media-index" },
        { id: "collection-media-cleanup" },
      ]);
    },
  );
  for (const row of await db.syncMedia
    .where("generation")
    .aboveOrEqual(0)
    .toArray()) {
    let item: MediaItem;
    let blob: Blob;
    if (row.table === "audio") {
      const audio = await db.audio.get(row.id);
      if (!audio) continue;
      const { blob: bytes, ...data } = audio;
      blob = bytes;
      item = {
        table: row.table,
        data,
        hash: await mediaHash(blob),
        bytes: blob.size,
        mime: blob.type,
      };
    } else {
      const asset = await db.cardAssets.get(row.id);
      if (!asset) continue;
      const { blob: bytes, ...data } = asset;
      blob = bytes;
      item = {
        table: row.table,
        data,
        hash: await mediaHash(blob),
        bytes: blob.size,
        mime: blob.type,
      };
    }
    await db.transaction(
      "rw",
      [db.syncMedia, db.syncMeta, db[row.table]],
      async () => {
        if ((await db.syncMedia.get(row.key))?.generation !== row.generation)
          return;
        await saveContent(item.hash, blob);
        await withoutSyncTracking(() => putMedia(item));
        await db.syncMedia.put(indexRow(item));
      },
    );
  }
}

export async function applyMediaList(items: MediaItem[]) {
  const prior = new Map(
    (await db.syncMedia.toArray()).map((row) => [row.key, row]),
  );
  const next = new Set(items.map((item) => mediaKey(item.table, item.data.id)));
  for (const table of mediaTables) {
    const removed = (await db[table].toCollection().primaryKeys()).filter(
      (id) => !next.has(mediaKey(table, id)),
    );
    await db[table].bulkDelete(removed);
  }
  const removed = [...prior.keys()].filter((key) => !next.has(key));
  let changed = removed.length > 0;
  await db.syncMedia.bulkDelete(removed);
  for (const item of items) {
    const row = indexRow(item);
    const old = prior.get(row.key);
    if (
      old?.item &&
      !old.missing &&
      old.item.hash === item.hash &&
      old.item.mime === item.mime &&
      old.item.bytes === item.bytes &&
      Object.keys(old.item.data).length === Object.keys(item.data).length &&
      Object.entries(old.item.data).every(
        ([key, value]) =>
          JSON.stringify(value) ===
          JSON.stringify((item.data as Record<string, unknown>)[key]),
      )
    )
      continue;
    if (
      await db.syncMeta
        .where("id")
        .equals(contentPrefix + item.hash)
        .count()
    )
      await putMedia(item);
    else {
      await db[item.table].delete(item.data.id);
      row.missing = 1;
    }
    changed = true;
    await db.syncMedia.put(row);
  }
  if (changed) await db.syncMeta.put({ id: "collection-media-cleanup" });
}

export async function installDownloadedMedia(hash: string, blob: Blob) {
  if ((await mediaHash(blob)) !== hash) throw new Error("sync_invalid_media");
  await saveContent(hash, blob);
  await db.transaction(
    "rw",
    [db.audio, db.cardAssets, db.syncMedia, db.syncMeta],
    () =>
      withoutSyncTracking(async () => {
        for (const row of await db.syncMedia
          .where("hash")
          .equals(hash)
          .toArray()) {
          if (!row.missing || !row.item) continue;
          if (blob.size !== row.item.bytes)
            throw new Error("sync_invalid_media");
          await putMedia(row.item);
          await db.syncMedia.put(indexRow(row.item));
        }
      }),
  );
}

export async function cleanupMedia() {
  if (!(await db.syncMeta.get("collection-media-cleanup"))) return;
  await db.transaction("rw", [db.syncMedia, db.syncMeta], async () => {
    if (
      !(await db.syncMeta.get("collection-media-index")) ||
      (await db.syncMedia.where("generation").aboveOrEqual(0).count())
    )
      return;
    const needed = new Set(await db.syncMedia.orderBy("hash").keys());
    for (const prefix of [outgoingHashes, uploadPrefix])
      for (const id of await db.syncMeta
        .where("id")
        .startsWith(prefix)
        .primaryKeys())
        needed.add(id.slice(prefix.length));
    const content = await db.syncMeta
      .where("id")
      .startsWith(mediaLinkPrefix)
      .primaryKeys();
    await db.syncMeta.bulkDelete(
      content.filter(
        (id) =>
          !id.startsWith(contentPrefix) ||
          !needed.has(id.slice(contentPrefix.length)),
      ),
    );
    await db.syncMeta.delete("collection-media-cleanup");
  });
}
