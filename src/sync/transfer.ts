import { z } from "zod";
import {
  snapshotSchema,
  syncScope,
  type SyncRecord,
  type SyncScope,
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
  media: z.unknown(),
});
const collections = ["records", "dependencies"] as const;
type MediaReference = z.infer<typeof mediaReferenceSchema>;
type MediaGroup = { record: SyncRecord; reference: MediaReference }[];
const mediaKey = (record: SyncRecord) =>
  JSON.stringify([record.key, record.device, record.counter]);

const blobHashes = new WeakMap<Blob, Promise<string>>();
export function mediaHash(blob: Blob) {
  let hash = blobHashes.get(blob);
  if (!hash) {
    hash = hashBytes(blob);
    blobHashes.set(blob, hash);
  }
  return hash;
}

async function hashBytes(blob: Blob) {
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
  const references: MediaReference[] = [];
  const packed = { ...snapshot };
  for (const collection of collections) {
    const records = [];
    for (const record of snapshot[collection]) {
      if (
        !record.deleted &&
        (record.kind === "cardAssets" || record.kind === "audio")
      ) {
        const blob = record.value?.blob;
        if (!(blob instanceof Blob)) throw new Error(t("sync_invalid_media"));
        const hash = await mediaHash(blob);
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
  scope: SyncScope,
  findLocalMedia: (
    hash: string,
    record: SyncRecord,
    bytes: number,
  ) => Promise<Blob | undefined>,
  loadMedia: (hash: string) => Promise<Blob>,
  reportMedia: (done: number, total: number) => void,
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
  for (const collection of collections)
    packed.snapshot[collection] = packed.snapshot[collection].filter(
      (record) => syncScope(record.kind) === scope,
    );
  if (scope === "study") return packed.snapshot;

  const references = mediaReferenceSchema.array().safeParse(packed.media);
  if (!references.success) throw new Error(t("sync_invalid_media"));
  const byCollection = {
    records: new Map(
      packed.snapshot.records.map((record) => [mediaKey(record), record]),
    ),
    dependencies: new Map(
      packed.snapshot.dependencies.map((record) => [mediaKey(record), record]),
    ),
  };
  for (const collection of collections) {
    if (byCollection[collection].size !== packed.snapshot[collection].length)
      throw new Error(t("sync_invalid_snapshot"));
  }
  const supplied = new Set<string>();
  const mediaGroups = new Map<string, MediaGroup>();
  for (const reference of references.data) {
    const record = byCollection[reference.collection].get(reference.key);
    const referenceKey = JSON.stringify([reference.collection, reference.key]);
    if (
      !record ||
      record.deleted ||
      !record.value ||
      supplied.has(referenceKey) ||
      record.value.blob !== null
    )
      throw new Error(t("sync_invalid_media"));
    supplied.add(referenceKey);
    const group = mediaGroups.get(reference.hash);
    if (group) group.push({ record, reference });
    else mediaGroups.set(reference.hash, [{ record, reference }]);
  }
  for (const collection of collections) {
    for (const record of packed.snapshot[collection]) {
      if (
        !record.deleted &&
        !supplied.has(JSON.stringify([collection, mediaKey(record)]))
      )
        throw new Error(t("sync_invalid_media"));
    }
  }
  const assign = async (media: Blob, hash: string, group: MediaGroup) => {
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
  };
  const missing = new Set<string>();
  await transferConcurrently(mediaGroups, async ([hash, group]) => {
    const { record, reference } = group[0]!;
    const local = await findLocalMedia(hash, record, reference.bytes);
    if (local) await assign(local, hash, group);
    else missing.add(hash);
  });
  let downloaded = 0;
  const pending = [...mediaGroups].filter(([hash]) => missing.has(hash));
  if (pending.length) reportMedia(0, pending.length);
  await transferConcurrently(pending, async ([hash, group]) => {
    await assign(await loadMedia(hash), hash, group);
    reportMedia(++downloaded, pending.length);
  });
  return packed.snapshot;
}
