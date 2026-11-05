import { db } from "@/platform/database/db";
import type { SyncRecord } from "@/sync/model";

function matchingMedia(
  record: SyncRecord,
  candidate: SyncRecord | undefined,
): Blob | undefined {
  if (
    candidate &&
    !candidate.deleted &&
    candidate.key === record.key &&
    candidate.kind === record.kind &&
    candidate.id === record.id &&
    candidate.device === record.device &&
    candidate.counter === record.counter &&
    candidate.value?.blob instanceof Blob
  )
    return candidate.value.blob;
  return undefined;
}

export async function findLocalMedia(
  record: SyncRecord,
): Promise<Blob | undefined> {
  if (
    record.deleted ||
    (record.kind !== "cardAssets" && record.kind !== "audio")
  )
    return undefined;
  const current = matchingMedia(record, await db.syncRecords.get(record.key));
  if (current) return current;
  const dependency = matchingMedia(
    record,
    await db.syncDependencies.get([record.device, record.counter]),
  );
  if (dependency) return dependency;
  return matchingMedia(record, await db.syncAuthored.get(record.key));
}
