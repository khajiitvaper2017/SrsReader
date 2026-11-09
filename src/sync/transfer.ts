import { z } from "zod";
import {
  snapshotSchema,
  type SyncRecord,
  type SyncSnapshot,
} from "@/sync/model";
import { t } from "@/shared/i18n/i18n";
import { transferConcurrently } from "@/sync/concurrency";

const mediaReferenceSchema = z.object({
  key: z.string(),
  collection: z.enum(["records", "dependencies"]),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
});
const packedSchema = z.object({
  snapshot: snapshotSchema,
  media: z.array(mediaReferenceSchema),
});
const mediaKey = (record: SyncRecord) =>
  JSON.stringify([record.key, record.device, record.counter]);

export async function mediaHash(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function packSnapshot(snapshot: SyncSnapshot) {
  const media = new Map<string, Blob>();
  const references: z.infer<typeof mediaReferenceSchema>[] = [];
  const hashes = new WeakMap<Blob, string>();
  const packed = { ...snapshot };
  for (const collection of ["records", "dependencies"] as const) {
    const records = [];
    for (const record of snapshot[collection]) {
      if (
        !record.deleted &&
        (record.kind === "cardAssets" || record.kind === "audio")
      ) {
        const blob = record.value?.blob;
        if (!(blob instanceof Blob)) throw new Error(t("sync_invalid_media"));
        let hash = hashes.get(blob);
        if (!hash) {
          hash = await mediaHash(blob);
          hashes.set(blob, hash);
        }
        media.set(hash, blob);
        references.push({
          collection,
          key: mediaKey(record),
          hash,
          mime: blob.type,
          bytes: blob.size,
        });
        records.push({ ...record, value: { ...record.value, blob: null } });
      } else records.push(record);
    }
    packed[collection] = records;
  }
  const encoded = new Blob([
    JSON.stringify({ snapshot: packed, media: references }),
  ]);
  const blob = await new Response(
    encoded.stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();
  return { blob: new Blob([blob], { type: "application/gzip" }), media };
}

export async function unpackSnapshot(
  blob: Blob,
  loadMedia: (hash: string, record: SyncRecord) => Promise<Blob>,
): Promise<SyncSnapshot> {
  let packed: z.infer<typeof packedSchema>;
  try {
    const decoded = await new Response(
      blob.stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    packed = packedSchema.parse(JSON.parse(decoded));
  } catch {
    throw new Error(t("sync_invalid_snapshot"));
  }
  const byCollection = {
    records: new Map(
      packed.snapshot.records.map((record) => [mediaKey(record), record]),
    ),
    dependencies: new Map(
      packed.snapshot.dependencies.map((record) => [mediaKey(record), record]),
    ),
  };
  for (const collection of ["records", "dependencies"] as const) {
    if (byCollection[collection].size !== packed.snapshot[collection].length)
      throw new Error(t("sync_invalid_snapshot"));
  }
  const supplied = new Set<string>();
  const mediaGroups = new Map<
    string,
    { record: SyncRecord; reference: (typeof packed.media)[number] }[]
  >();
  for (const reference of packed.media) {
    const record = byCollection[reference.collection].get(reference.key);
    const referenceKey = JSON.stringify([reference.collection, reference.key]);
    if (
      !record ||
      record.deleted ||
      !record.value ||
      (record.kind !== "cardAssets" && record.kind !== "audio") ||
      supplied.has(referenceKey) ||
      record.value.blob !== null
    )
      throw new Error(t("sync_invalid_media"));
    supplied.add(referenceKey);
    const group = mediaGroups.get(reference.hash);
    if (group) group.push({ record, reference });
    else mediaGroups.set(reference.hash, [{ record, reference }]);
  }
  await transferConcurrently(mediaGroups, async ([hash, group]) => {
    const first = group[0]!;
    const media = await loadMedia(hash, first.record);
    if (
      group.some(({ reference }) => media.size !== reference.bytes) ||
      (await mediaHash(media)) !== hash
    )
      throw new Error(t("sync_invalid_media"));
    for (const { record, reference } of group)
      record.value!.blob =
        media.type === reference.mime
          ? media
          : new Blob([media], { type: reference.mime });
  });
  for (const collection of ["records", "dependencies"] as const) {
    for (const record of packed.snapshot[collection]) {
      if (
        !record.deleted &&
        (record.kind === "cardAssets" || record.kind === "audio") &&
        !supplied.has(JSON.stringify([collection, mediaKey(record)]))
      )
        throw new Error(t("sync_invalid_media"));
    }
  }
  return packed.snapshot;
}
