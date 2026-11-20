import { db } from "@/platform/database/db";
import type { SyncRecord } from "@/sync/model";
import { mediaHash } from "@/sync/transfer";

export function createLocalMediaFinder() {
  let local: Promise<Map<number, Blob[]>> | undefined;
  const hashes = new Map<number, Promise<Map<string, Blob>>>();

  async function bySize() {
    const blobs = new Map<number, Blob[]>();
    for (const { blob } of [
      ...(await db.cardAssets.toArray()),
      ...(await db.audio.toArray()),
    ]) {
      const matches = blobs.get(blob.size);
      if (matches) matches.push(blob);
      else blobs.set(blob.size, [blob]);
    }
    return blobs;
  }

  return async (hash: string, record: SyncRecord, bytes: number) => {
    for (const read of [
      () => db.syncRecords.get(record.key),
      () => db.syncDependencies.get([record.device, record.counter]),
      () => db.syncAuthored.get(record.key),
    ]) {
      const blob = (await read())?.value?.blob;
      if (
        blob instanceof Blob &&
        blob.size === bytes &&
        (await mediaHash(blob)) === hash
      )
        return blob;
    }

    // Imports of the same deck can use different IDs for identical files.
    const candidates = (await (local ??= bySize())).get(bytes);
    if (!candidates) return;
    let matching = hashes.get(bytes);
    if (!matching) {
      matching = (async () => {
        const result = new Map<string, Blob>();
        for (const blob of candidates) result.set(await mediaHash(blob), blob);
        return result;
      })();
      hashes.set(bytes, matching);
    }
    return (await matching).get(hash);
  };
}
