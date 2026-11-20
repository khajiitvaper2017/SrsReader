import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { getSettings } from "@/settings/store";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { replayBatch } from "@/srs/engines/rwkv/replay";
import { createLocalMediaFinder } from "@/sync/media";
import { mergeSnapshots } from "@/sync/merge";
import {
  discardStagedMergeMedia,
  migrateSyncFrontier,
  outgoingId,
  outgoingMedia,
  readStagedSnapshot,
  replaceSyncRows,
  stageSnapshot,
} from "@/sync/metadata";
import {
  syncWorkError,
  type PackedSync,
  type SyncWork,
  type SyncWorkError,
  type SyncWorkMessage,
} from "@/sync/processing";
import {
  captureSnapshot,
  initializeTracking,
  prepareAccountSync,
} from "@/sync/tracking";
import { packSnapshot, unpackSnapshot } from "@/sync/transfer";

const mediaRequests = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void }
>();

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
    await getSettings();
    switch (request.action) {
      case "initialize":
        // Tracking starts before sync jobs; discard payloads left by interrupted jobs.
        await db.transaction("rw", db.syncMeta, async () => {
          await db.syncMeta.where("id").startsWith("sync-work-").delete();
          await db.syncMeta.where("id").startsWith("sync-worker-").delete();
          await db.syncMeta.bulkDelete(["captured", "drive-index"]);
        });
        await discardStagedMergeMedia();
        await migrateSyncFrontier();
        await initializeTracking();
        break;
      case "prepare":
        await prepareAccountSync(request.replaceAccount);
        break;
      case "unpack": {
        const input = await db.syncMeta.get(request.source);
        if (!input || !("blob" in input) || !(input.blob instanceof Blob))
          throw new Error("sync_invalid_snapshot");
        const snapshot = await unpackSnapshot(
          input.blob,
          request.scope,
          createLocalMediaFinder(),
          async (hash) => {
            const key = `sync-worker-${id}-${hash}`;
            const pending = Promise.withResolvers<void>();
            mediaRequests.set(hash, pending);
            send({ media: hash });
            await pending.promise;
            const loaded = await db.syncMeta.get(key);
            if (
              !loaded ||
              !("blob" in loaded) ||
              !(loaded.blob instanceof Blob)
            )
              throw new Error("sync_invalid_media");
            await db.syncMeta.delete(key);
            return loaded.blob;
          },
          (done, total) =>
            send({ progress: { phase: "download_media", done, total } }),
        );
        if (
          snapshot.device !== request.device ||
          snapshot.revision !== request.revision
        )
          throw new Error("sync_invalid_snapshot");
        send({ progress: { phase: "prepare", done: 0, total: 0 } });
        await stageSnapshot(request.key, snapshot);
        break;
      }
      case "merge": {
        const snapshots = [];
        for (const key of request.keys)
          snapshots.push(await readStagedSnapshot(key));
        await mergeSnapshots(snapshots, request.scope, () =>
          send({ progress: { phase: "apply", done: 0, total: 0 } }),
        );
        break;
      }
      case "pack": {
        const key = outgoingId(request.scope);
        const outgoing = (await db.syncMeta.get(key)) as PackedSync | undefined;
        if (outgoing?.account === request.account) break;
        const snapshot = await captureSnapshot(request.scope);
        const { blob, media } = await packSnapshot(snapshot);
        // A fresh media stage commits each batch. The header makes it reusable.
        if (request.scope === "media")
          await replaceSyncRows(outgoingMedia, [...media]);
        await db.syncMeta.put({
          id: key,
          account: request.account,
          device: snapshot.device,
          revision: snapshot.revision,
          blob,
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
