import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { getSettings } from "@/settings/store";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { replayBatch } from "@/srs/engines/rwkv/replay";
import { applyCollection, captureCollection } from "@/sync/collection";
import { installDownloadedMedia } from "@/sync/media";
import { transferConcurrently } from "@/sync/concurrency";
import {
  syncWorkError,
  type SyncWork,
  type SyncWorkError,
  type SyncWorkMessage,
} from "@/sync/processing";

const mediaRequests = new Map<string, PromiseWithResolvers<void>>();

self.onmessage = async (
  event: MessageEvent<{
    id: string;
    request?: SyncWork;
    media?: string;
    error?: SyncWorkError;
  }>,
) => {
  const { id, request, media, error } = event.data;
  if (media) {
    const pending = mediaRequests.get(media);
    mediaRequests.delete(media);
    if (error) pending?.reject(Object.assign(new Error(error.message), error));
    else pending?.resolve();
    return;
  }
  if (!request) return;
  const send = (message: Omit<SyncWorkMessage, "id">) =>
    self.postMessage({ id, ...message });
  try {
    switch (request.action) {
      case "capture":
        await captureCollection(
          request.account,
          request.parents,
          request.generation,
          request.mediaGeneration,
          request.includeMediaHashes,
        );
        break;
      case "apply": {
        const source = (await db.syncMeta.get(request.source))?.blob;
        if (!(source instanceof Blob)) throw new Error("sync_invalid_snapshot");
        await applyCollection(source, request.hash, request.base);
        break;
      }
      case "media": {
        const refs = await db.syncMedia.where("missing").equals(1).toArray();
        const hashes = new Set(
          refs.flatMap((row) => (row.hash ? [row.hash] : [])),
        );
        let done = 0;
        await transferConcurrently(hashes, async (hash) => {
          const pending = Promise.withResolvers<void>();
          mediaRequests.set(hash, pending);
          send({ media: hash });
          await pending.promise;
          const key = `sync-worker-${id}-${hash}`;
          const blob = (await db.syncMeta.get(key))?.blob;
          if (blob instanceof Blob) {
            await installDownloadedMedia(hash, blob);
            await db.syncMeta.delete(key);
          }
          send({
            progress: {
              phase: "download_media",
              done: ++done,
              total: hashes.size,
            },
          });
        });
        break;
      }
      case "rebuild": {
        let settings = await getSettings();
        if (settings.algorithm !== "rwkv") break;
        let status = await rwkvStatus(settings);
        // Sync transfers neither models nor model-download consent.
        if (!status.downloaded) break;
        const report = () =>
          send({
            progress: {
              phase: "rebuild",
              done: status.processed,
              total: status.total,
            },
          });
        if (!status.ready) report();
        while (!status.ready) {
          settings = await getSettings();
          if (settings.algorithm !== "rwkv") break;
          status = await srsWrite(() => replayBatch(settings));
          report();
        }
        break;
      }
    }
    send({ done: true });
  } catch (failure) {
    send({ error: syncWorkError(failure) });
  }
};
