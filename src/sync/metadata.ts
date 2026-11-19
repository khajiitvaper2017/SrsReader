import type { Table } from "dexie";
import { db } from "@/platform/database/db";
import {
  isMediaLink,
  mediaLinkFor,
  mediaLinkPrefix,
  resolveMediaLink,
  type MediaLink,
} from "@/platform/database/media-links";
import {
  syncRecordSchema,
  type SyncRecord,
  type SyncSnapshot,
} from "@/sync/model";

const writeBatchSize = 100;

export async function putSyncBatches<T, Insert>(
  table: Table<T, string, Insert>,
  rows: Insert[],
) {
  for (let offset = 0; offset < rows.length; offset += writeBatchSize)
    await table.bulkPut(rows.slice(offset, offset + writeBatchSize));
}

export async function readSyncRows<T>(prefix: string): Promise<T[]> {
  const values: T[] = [];
  let last = prefix;
  for (;;) {
    const rows = await db.syncMeta
      .where("id")
      .between(last, prefix + "\uffff", false, false)
      .limit(256)
      .toArray();
    for (const row of rows)
      values.push((row as { id: string; value: T }).value);
    if (rows.length < 256) return values;
    last = rows.at(-1)!.id;
  }
}

// Call inside the transaction that updates the corresponding metadata.
export async function replaceSyncRows<T>(prefix: string, values: T[]) {
  await db.syncMeta.where("id").startsWith(prefix).delete();
  await putSyncBatches(
    db.syncMeta,
    values.map((value, index) => ({
      id: prefix + String(index).padStart(10, "0"),
      value,
    })),
  );
}

export async function stageSnapshot(key: string, snapshot: SyncSnapshot) {
  const { records, dependencies, ...header } = snapshot;
  // Job keys are unique. Commit each batch and publish the header last.
  await replaceSyncRows(`${key}:records:`, records);
  await replaceSyncRows(`${key}:dependencies:`, dependencies);
  await db.syncMeta.put({ id: key, header });
}

export async function readStagedSnapshot(key: string): Promise<SyncSnapshot> {
  const row = await db.syncMeta.get(key);
  if (!row || !("header" in row)) throw new Error("sync_invalid_snapshot");
  return {
    ...(row.header as Omit<SyncSnapshot, "records" | "dependencies">),
    records: await readSyncRows<SyncRecord>(`${key}:records:`),
    dependencies: await readSyncRows<SyncRecord>(`${key}:dependencies:`),
  };
}

const mergeRows = "merge-frontier:";
type MergeEntry = { record: SyncRecord; current: boolean; retained: boolean };

export async function readMergeFrontier() {
  const entries = await readSyncRows<MergeEntry>(mergeRows);
  for (const { record } of entries) {
    const link = record.value?.blob;
    if (isMediaLink(link))
      record.value!.blob = resolveMediaLink(
        link,
        await db.syncMeta.get(link.syncMedia),
      );
  }
  return {
    records: entries
      .filter((entry) => entry.current)
      .map((entry) => entry.record),
    retained: entries
      .filter((entry) => entry.retained)
      .map((entry) => entry.record),
  };
}

const mediaStageId = "merge-media-stage";
const recordVersion = (record: SyncRecord) =>
  JSON.stringify([record.key, record.device, record.counter]);

export async function discardStagedMergeMedia() {
  await db.transaction("rw", db.syncMeta, async () => {
    const stage = await db.syncMeta.get(mediaStageId);
    if (!stage || !("prefix" in stage) || typeof stage.prefix !== "string")
      return;
    await db.syncMeta.where("id").startsWith(stage.prefix).delete();
    await db.syncMeta.delete(mediaStageId);
  });
}

export async function stageMergeMedia(sources: SyncRecord[][]) {
  await discardStagedMergeMedia();
  const prefix = mediaLinkPrefix + crypto.randomUUID() + ":";
  const links = new Map<string, MediaLink>();
  const staged: { id: string; blob: Blob }[] = [];
  for (const records of sources) {
    for (const record of records) {
      if (record.kind !== "cardAssets" && record.kind !== "audio") continue;
      const blob = record.value?.blob;
      if (!(blob instanceof Blob)) continue;
      const version = recordVersion(record);
      if (links.has(version)) continue;
      const existing = mediaLinkFor.get(blob);
      const link = existing ?? { syncMedia: prefix + staged.length };
      links.set(version, link);
      if (!existing) staged.push({ id: link.syncMedia, blob });
    }
  }
  await db.syncMeta.put({ id: mediaStageId, prefix });
  // Each batch must commit before Chromium opens files for the next batch.
  await putSyncBatches(db.syncMeta, staged);
  return links;
}

// Call inside the transaction that publishes the collection and merge history.
export async function publishMergeMedia(used: Set<string>) {
  const keys = await db.syncMeta
    .where("id")
    .startsWith(mediaLinkPrefix)
    .primaryKeys();
  await db.syncMeta.bulkDelete(keys.filter((key) => !used.has(key)));
  await db.syncMeta.delete(mediaStageId);
}

export async function writeMergeFrontier(
  records: SyncRecord[],
  retained: SyncRecord[],
) {
  const byVersion = new Map<string, MergeEntry>();
  for (const record of records)
    byVersion.set(recordVersion(record), {
      record,
      current: true,
      retained: false,
    });
  for (const record of retained) {
    const key = recordVersion(record);
    const entry = byVersion.get(key);
    if (entry) entry.retained = true;
    else byVersion.set(key, { record, current: false, retained: true });
  }
  // Both sets can contain the same version and its attached media.
  await replaceSyncRows(mergeRows, [...byVersion.values()]);
}

export function mergeMediaLink(
  links: ReadonlyMap<string, MediaLink>,
  used: Set<string>,
  record: SyncRecord,
) {
  const link = links.get(recordVersion(record));
  if (link) used.add(link.syncMedia);
  return link;
}

export const outgoingId = "sync-outgoing";
export const outgoingMedia = "sync-outgoing:media:";

export async function clearOutgoing() {
  await db.transaction("rw", db.syncMeta, async () => {
    await db.syncMeta.bulkDelete(["outgoing", outgoingId]);
    await db.syncMeta.where("id").startsWith(outgoingMedia).delete();
  });
}

export async function migrateSyncFrontier() {
  await db.transaction("rw", db.syncMeta, async () => {
    const legacy = await db.syncMeta.get("merge-frontier");
    if (!legacy) return;
    await writeMergeFrontier(
      syncRecordSchema.array().parse("records" in legacy ? legacy.records : []),
      syncRecordSchema
        .array()
        .parse("retained" in legacy ? legacy.retained : []),
    );
    await db.syncMeta.delete("merge-frontier");
  });
}
