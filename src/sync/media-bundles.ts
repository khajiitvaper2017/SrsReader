import { BlobReader, BlobWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { t } from "@/shared/i18n/i18n";
import { downloadFile, type DriveFile } from "@/sync/drive";
import { mediaHash } from "@/sync/transfer";

const MAX_FILES = 25;
// Leave room for ZIP headers so a bundle fits one multipart upload.
const MAX_BYTES = 1024 * 1024 - 16 * 1024;
const MAX_ARCHIVE_BYTES = 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

type MediaEntry = [hash: string, blob: Blob];

export function* batchMedia(
  media: Iterable<MediaEntry>,
): Generator<MediaEntry[]> {
  let batch: MediaEntry[] = [];
  let bytes = 0;
  for (const entry of media) {
    if (
      batch.length &&
      (batch.length === MAX_FILES || bytes + entry[1].size > MAX_BYTES)
    ) {
      yield batch;
      batch = [];
      bytes = 0;
    }
    batch.push(entry);
    bytes += entry[1].size;
    if (bytes >= MAX_BYTES) {
      yield batch;
      batch = [];
      bytes = 0;
    }
  }
  if (batch.length) yield batch;
}

export function mediaHashes(file: DriveFile): string[] {
  const properties = file.appProperties;
  if (
    properties?.srsKind === "media" &&
    properties.hash &&
    HASH.test(properties.hash)
  )
    return [properties.hash];
  if (properties?.srsKind !== "media-bundle") return [];
  const hashes = Object.entries(properties)
    .filter(
      ([key, value]) =>
        key.startsWith("m") && HASH.test(key.slice(1)) && value === "1",
    )
    .map(([key]) => key.slice(1));
  return hashes.length <= MAX_FILES ? hashes : [];
}

export async function packMediaBundle(
  media: MediaEntry[],
  signal: AbortSignal,
) {
  if (
    !media.length ||
    media.length > MAX_FILES ||
    new Set(media.map(([hash]) => hash)).size !== media.length ||
    media.some(([hash]) => !HASH.test(hash)) ||
    media.reduce((total, [, blob]) => total + blob.size, 0) > MAX_BYTES
  )
    throw new Error(t("sync_invalid_media"));
  const writer = new ZipWriter(new BlobWriter("application/zip"), {
    level: 0,
    useWebWorkers: false,
    extendedTimestamp: false,
    lastModDate: new Date(1980, 0, 1),
  });
  try {
    for (const [hash, blob] of [...media].sort(([a], [b]) =>
      a.localeCompare(b),
    ))
      await writer.add(hash, new BlobReader(blob), { signal });
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}

async function unpackMediaBundle(
  blob: Blob,
  file: DriveFile,
  signal: AbortSignal,
) {
  if (blob.size > MAX_ARCHIVE_BYTES) throw new Error(t("sync_invalid_media"));
  const expected = new Set(mediaHashes(file));
  const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    if (
      !expected.size ||
      entries.length !== expected.size ||
      new Set(entries.map((entry) => entry.filename)).size !== entries.length ||
      entries.some(
        (entry) =>
          entry.directory ||
          !expected.has(entry.filename) ||
          entry.compressionMethod !== 0 ||
          entry.compressedSize !== entry.uncompressedSize ||
          !Number.isSafeInteger(entry.uncompressedSize) ||
          entry.uncompressedSize < 0,
      ) ||
      entries.reduce((total, entry) => total + entry.uncompressedSize, 0) >
        MAX_BYTES
    )
      throw new Error(t("sync_invalid_media"));
    const media = new Map<string, Blob>();
    for (const entry of entries) {
      if (entry.directory) throw new Error(t("sync_invalid_media"));
      media.set(
        entry.filename,
        await entry.getData(new BlobWriter(), {
          signal,
          checkSignature: true,
        }),
      );
    }
    return media;
  } finally {
    await reader.close();
  }
}

export function createMediaDownloader(account: string, signal: AbortSignal) {
  const pending = new Map<string, Promise<Map<string, Blob>>>();
  const cached = new Map<string, Map<string, Blob>>();
  return async (file: DriveFile, hash: string): Promise<Blob> => {
    signal.throwIfAborted();
    let media = cached.get(file.id);
    if (media) {
      cached.delete(file.id);
      cached.set(file.id, media);
    } else {
      let loading = pending.get(file.id);
      if (!loading) {
        loading = downloadFile(file.id, account)
          .then(async (blob) => {
            const result =
              file.appProperties?.srsKind === "media-bundle"
                ? await unpackMediaBundle(blob, file, signal)
                : new Map([[hash, blob]]);
            // Only small bundles are cached; large standalone files stay in the snapshot.
            if (file.appProperties?.srsKind === "media-bundle") {
              cached.set(file.id, result);
              if (cached.size > 6) cached.delete(cached.keys().next().value!);
            }
            return result;
          })
          .finally(() => pending.delete(file.id));
        pending.set(file.id, loading);
      }
      media = await loading;
    }
    signal.throwIfAborted();
    const blob = media.get(hash);
    if (!blob) throw new Error(t("sync_invalid_media"));
    return blob;
  };
}

export async function mediaBundleName(media: MediaEntry[]): Promise<string> {
  const hashes = media.map(([hash]) => hash).sort();
  return `media-bundle.${await mediaHash(new Blob(hashes))}.zip`;
}
