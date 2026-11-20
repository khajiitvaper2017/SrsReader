import type { Table } from "dexie";
import { db } from "@/platform/database/db";

export const outgoingHashes = "collection-outgoing-hash:";

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
