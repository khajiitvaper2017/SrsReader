import { db } from "@/platform/database/db";
import {
  syncRecordSchema,
  type SyncRecord,
  type SyncSnapshot,
} from "@/sync/model";

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
  await db.syncMeta.bulkPut(
    values.map((value, index) => ({
      id: prefix + String(index).padStart(10, "0"),
      value,
    })),
  );
}

export async function stageSnapshot(key: string, snapshot: SyncSnapshot) {
  const { records, dependencies, ...header } = snapshot;
  await db.transaction("rw", db.syncMeta, async () => {
    await replaceSyncRows(`${key}:records:`, records);
    await replaceSyncRows(`${key}:dependencies:`, dependencies);
    await db.syncMeta.put({ id: key, header });
  });
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
  return {
    records: entries
      .filter((entry) => entry.current)
      .map((entry) => entry.record),
    retained: entries
      .filter((entry) => entry.retained)
      .map((entry) => entry.record),
  };
}

export async function writeMergeFrontier(
  records: SyncRecord[],
  retained: SyncRecord[],
) {
  const byVersion = new Map<string, MergeEntry>();
  const version = (record: SyncRecord) =>
    JSON.stringify([record.key, record.device, record.counter]);
  for (const record of records)
    byVersion.set(version(record), { record, current: true, retained: false });
  for (const record of retained) {
    const key = version(record);
    const entry = byVersion.get(key);
    if (entry) entry.retained = true;
    else byVersion.set(key, { record, current: false, retained: true });
  }
  // Both sets can contain the same version and its attached media.
  await replaceSyncRows(mergeRows, [...byVersion.values()]);
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
