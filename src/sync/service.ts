import { browser } from "wxt/browser";
import { broadcast, notify } from "@/background/events";
import {
  cancelSyncProcessing,
  processSync,
  retainSyncHost,
} from "@/imports/commands";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { t } from "@/shared/i18n/i18n";
import {
  authStatus,
  cancelGoogle,
  connectGoogle,
  disconnectGoogle,
  initializeAuth,
} from "@/sync/auth";
import {
  cancelDriveTransfers,
  clearDriveUploads,
  deleteFile,
  discardDriveUpload,
  downloadFile,
  driveTransferSignal,
  listFiles,
  uploadFile,
  type DriveFile,
} from "@/sync/drive";
import { readDriveFiles, saveDriveFiles } from "@/sync/drive-index";
import {
  clearOutgoing,
  collectionIsEmpty,
  outgoingId,
} from "@/sync/collection";
import { cleanupMedia, contentPrefix, uploadPrefix } from "@/sync/media";
import { outgoingHashes, putSyncBatches } from "@/sync/metadata";
import { transferConcurrently } from "@/sync/concurrency";
import {
  batchMedia,
  createMediaDownloader,
  mediaBundleName,
  mediaHashes,
  packMediaBundle,
} from "@/sync/media-bundles";
import {
  type CollectionBase,
  type SyncChoice,
  type SyncDecision,
  type SyncProgress,
  type SyncStatus,
  type SyncStorage,
  type SyncTransferState,
} from "@/sync/model";
import { isLargeValueReadError, type PackedSync } from "@/sync/processing";
import { localVersions, withoutSyncTracking } from "@/sync/tracking";
import { reviewSyncLock } from "@/sync/contracts";

const storageKey = "syncTransfer";
const periodicAlarm = "srs-reader-sync";
const editAlarm = "srs-reader-sync-edits";
const retryAlarm = "srs-reader-sync-retry";
const emptyTransfer = (): SyncTransferState => ({
  account: null,
  automatic: true,
  lastSuccess: null,
  error: null,
  authorizationRequired: false,
  failures: 0,
  retryAt: 0,
  storage: null,
});
let transfer = emptyTransfer();
let initialized: Promise<void> | undefined;
let active: Promise<void> | undefined;
let storageRequest: Promise<void> | undefined;
let connecting = false;
let disconnecting = false;
let cancelled = false;
let progress: SyncProgress | null = null;
let lastProgressReport = 0;
let started = false;
let stateWrites = Promise.resolve();
let pending = 0;
let choice: SyncChoice | null = null;
let mediaPending = false;
let retainedHost: ReturnType<typeof retainSyncHost> | undefined;

async function refreshPending() {
  const base = await db.syncMeta.get("collection-base");
  pending = Number(
    (await localVersions()).generation !==
      (base?.account === transfer.account ? (base?.generation ?? 0) : 0),
  );
  mediaPending = Boolean(
    (await db.syncMedia.where("missing").equals(1).count()) ||
    (await db.syncMeta.where("id").startsWith(uploadPrefix).count()),
  );
}

async function changed() {
  await broadcast({ event: "changed", scope: "sync" });
}
async function persist() {
  const value = structuredClone(transfer);
  stateWrites = stateWrites
    .catch(() => {})
    .then(() => browser.storage.local.set({ [storageKey]: value }));
  await stateWrites;
  await changed();
}
async function initialize() {
  initialized ??= (async () => {
    const stored = (await browser.storage.local.get(storageKey))[storageKey] as
      Partial<SyncTransferState> | undefined;
    transfer = {
      ...emptyTransfer(),
      ...Object.fromEntries(
        Object.entries(stored ?? {}).filter(([key]) =>
          Object.hasOwn(transfer, key),
        ),
      ),
    };
    initializeAuth();
  })();
  await initialized;
}
function checkCancelled() {
  if (cancelled)
    throw Object.assign(new Error(t("sync_cancelled")), {
      code: "SYNC_AUTH_CANCELLED",
    });
}
async function report(
  phase: SyncProgress["phase"],
  done: number,
  total: number,
  unit?: SyncProgress["unit"],
) {
  const now = performance.now();
  const announce =
    progress?.phase !== phase ||
    done === total ||
    now - lastProgressReport >= 100;
  progress = { phase, done, total, unit };
  if (announce) {
    lastProgressReport = now;
    await changed();
  }
}
async function processWork(
  request: Parameters<typeof processSync>[0],
  loadMedia?: Parameters<typeof processSync>[2],
) {
  checkCancelled();
  await (retainedHost ??= retainSyncHost());
  checkCancelled();
  await processSync(
    request,
    (value) => {
      void report(value.phase, value.done, value.total, value.unit).catch(
        console.warn,
      );
    },
    loadMedia,
  );
  checkCancelled();
}
function errorCode(error: unknown) {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code;
  return error instanceof Error ? error.message : String(error);
}
function driveStorageUsage(files: DriveFile[]): SyncStorage {
  let bytes: number | null = 0;
  for (const file of files) {
    const raw = file.quotaBytesUsed ?? file.size;
    const size =
      typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(size) || !Number.isSafeInteger(bytes + size)) {
      bytes = null;
      break;
    }
    bytes += size;
  }
  return { bytes, files: files.length, updated: Date.now() };
}
async function bindAccount(account: string) {
  if (transfer.account === account) return;
  await clearOutgoing();
  await clearDriveUploads();
  await db.syncMeta.where("id").startsWith(uploadPrefix).delete();
  choice = null;
  transfer = { ...emptyTransfer(), account, automatic: transfer.automatic };
  await persist();
}

async function assertAccount() {
  const auth = await authStatus();
  if (!auth.account)
    throw Object.assign(new Error(t("sync_auth_required")), {
      code: "SYNC_AUTH_REQUIRED",
    });
  if (transfer.account !== auth.account.id)
    throw Object.assign(new Error(t("sync_account_changed")), {
      code: "SYNC_ACCOUNT_CHANGED",
    });
  return auth.account;
}
const collectionKind = "collection";
const collectionProperties = (hash: string) => ({
  srsKind: collectionKind,
  hash,
});

function supersededBy(file: DriveFile) {
  let ids: unknown;
  try {
    ids = JSON.parse(file.description ?? "[]");
  } catch {
    throw new Error("sync_invalid_snapshot");
  }
  if (
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== "string" || id === file.id)
  )
    throw new Error("sync_invalid_snapshot");
  return ids as string[];
}

function collectionHeads(copies: DriveFile[]) {
  const replaced = new Set(copies.flatMap(supersededBy));
  const heads = copies.filter(({ id }) => !replaced.has(id));
  if (copies.length && !heads.length) throw new Error("sync_invalid_snapshot");
  return { heads, replaced };
}

function mediaFiles(files: DriveFile[]) {
  const indexed = new Map<string, DriveFile>();
  for (const file of files)
    for (const hash of mediaHashes(file)) indexed.set(hash, file);
  return indexed;
}

async function transferMedia(account: string, files: DriveFile[]) {
  const uploads = await db.syncMeta
    .where("id")
    .startsWith(uploadPrefix)
    .primaryKeys();
  const missing = await db.syncMedia.where("missing").equals(1).count();
  if (!uploads.length && !missing) return;
  const existing = mediaFiles(files);
  const toUpload: [string, Blob][] = [];
  for (const key of uploads) {
    const hash = key.slice(uploadPrefix.length);
    if (existing.has(hash)) {
      await db.syncMeta.delete(key);
      continue;
    }
    const blob = (await db.syncMeta.get(contentPrefix + hash))?.blob;
    if (!(blob instanceof Blob)) throw new Error("sync_invalid_media");
    toUpload.push([hash, blob]);
  }
  if (toUpload.length) {
    await report("media", 0, toUpload.length);
    let done = 0;
    await transferConcurrently(batchMedia(toUpload), async (batch) => {
      checkCancelled();
      const [hash, blob] = batch[0]!;
      const file =
        batch.length === 1
          ? await uploadFile(
              `media.${hash}`,
              blob,
              { srsKind: "media", hash },
              account,
            )
          : await uploadFile(
              await mediaBundleName(batch),
              await packMediaBundle(batch, driveTransferSignal()),
              {
                srsKind: "media-bundle",
                ...Object.fromEntries(batch.map(([hash]) => [`m${hash}`, "1"])),
              },
              account,
            );
      for (const [hash] of batch) existing.set(hash, file);
      files.push(file);
      // Persist confirmed uploads before dropping their retry markers.
      done += batch.length;
      await report("media", done, toUpload.length);
    });
    await saveDriveFiles(account, files);
    await db.syncMeta.bulkDelete(toUpload.map(([hash]) => uploadPrefix + hash));
  }
  if (missing) {
    const download = createMediaDownloader(account, driveTransferSignal());
    await processWork({ action: "media" }, (hash) => {
      const file = existing.get(hash);
      return file ? download(file, hash) : Promise.resolve(undefined);
    });
  }
}

async function acknowledgeUpload(
  outgoing: PackedSync,
  file: DriveFile,
  files: DriveFile[],
) {
  const hashes = await db.syncMeta
    .where("id")
    .startsWith(outgoingHashes)
    .primaryKeys();
  const existing = hashes.length
    ? mediaFiles(files)
    : new Map<string, DriveFile>();
  await db.transaction("rw", db.syncMeta, async () => {
    const uploads = [];
    for (const key of hashes) {
      const hash = key.slice(outgoingHashes.length);
      if (
        !existing.has(hash) &&
        (await db.syncMeta
          .where("id")
          .equals(contentPrefix + hash)
          .count())
      )
        uploads.push({ id: uploadPrefix + hash });
    }
    await putSyncBatches(db.syncMeta, uploads);
    await db.syncMeta.put({
      id: "collection-base",
      account: outgoing.account,
      file: file.id,
      generation: outgoing.generation,
      mediaGeneration: outgoing.mediaGeneration,
    });
    await clearOutgoing();
  });
}

async function publishCollection(outgoing: PackedSync, files: DriveFile[]) {
  await report("upload", 0, 1);
  const file = await uploadFile(
    outgoing.name,
    outgoing.blob,
    collectionProperties(outgoing.hash),
    outgoing.account,
    JSON.stringify(outgoing.parents),
  );
  files.push(file);
  await saveDriveFiles(outgoing.account, files);
  await report("upload", 1, 1);
  return file;
}

async function synchronize(decision?: SyncDecision) {
  const account = (await assertAccount()).id;
  await report("check", 0, 0);
  const files = await readDriveFiles(account);
  checkCancelled();
  transfer.storage = driveStorageUsage(files);
  let outgoing = (await db.syncMeta.get(outgoingId)) as PackedSync | undefined;
  if (outgoing?.account === account) {
    const committed = files.find(
      (file) =>
        file.name === outgoing!.name &&
        file.appProperties?.srsKind === collectionKind &&
        file.appProperties.hash === outgoing!.hash &&
        file.description === JSON.stringify(outgoing!.parents) &&
        file.size === String(outgoing!.blob.size),
    );
    if (committed) {
      await acknowledgeUpload(outgoing, committed, files);
      outgoing = undefined;
    }
  }
  const copies = files.filter(
    (file) => file.appProperties?.srsKind === collectionKind,
  );
  const { heads, replaced } = collectionHeads(copies);
  const base = (await db.syncMeta.get("collection-base")) as
    CollectionBase | undefined;
  const { generation, mediaGeneration } = await localVersions();
  const current = base?.account === account ? base : undefined;
  const empty = !current && (await collectionIsEmpty());
  const dirty = current ? generation !== current.generation : !empty;
  const legacy =
    !heads.length &&
    files.some(
      (file) =>
        file.appProperties?.srsKind === "snapshot" ||
        file.appProperties?.srsKind === "media-snapshot",
    );
  const parents = copies.map(({ id }) => id).sort();
  const head = heads[0];
  const conflict =
    heads.length > 1 || (head && dirty && head.id !== current?.file);
  const kind = legacy ? "upgrade" : conflict ? "conflict" : undefined;
  const canUpload = legacy ? !(await collectionIsEmpty()) : !empty;
  const token = JSON.stringify([account, generation, kind, parents, canUpload]);
  if (
    kind &&
    (decision?.token !== token ||
      !(decision.keep === "local"
        ? canUpload
        : heads.some(({ id }) => id === decision.keep)))
  ) {
    choice = {
      kind,
      token,
      canUpload,
      copies: heads.map(({ id, createdTime }) => ({
        id,
        created: createdTime,
      })),
    };
    return;
  }
  if (!kind && decision) {
    choice = null;
    return;
  }
  choice = null;

  const selected = kind ? heads.find(({ id }) => id === decision?.keep) : head;
  const uploadLocal = kind ? decision?.keep === "local" : dirty;
  const remove = new Set(replaced);
  if (uploadLocal) {
    if (
      !outgoing ||
      outgoing.account !== account ||
      outgoing.generation !== generation ||
      JSON.stringify(outgoing.parents) !== JSON.stringify(parents)
    ) {
      if (outgoing) await discardDriveUpload(outgoing.account, outgoing.name);
      await report("prepare", 0, 0);
      await processWork({
        action: "capture",
        account,
        generation,
        parents,
        mediaGeneration,
        includeMediaHashes: mediaGeneration !== current?.mediaGeneration,
      });
      outgoing = (await db.syncMeta.get(outgoingId)) as PackedSync;
    }
    if (generation !== (await localVersions()).generation)
      throw new Error("sync_collection_changed");
    const file = await publishCollection(outgoing, files);
    await acknowledgeUpload(outgoing, file, files);
    for (const id of parents) remove.add(id);
  } else if (selected && (selected.id !== current?.file || kind)) {
    const hash = selected.appProperties?.hash;
    if (!hash || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error("sync_invalid_snapshot");
    await report("download", 0, 0, "bytes");
    const blob = await downloadFile(selected.id, account, (done, total) => {
      void report("download", done, total, "bytes").catch(console.warn);
    });
    const source = "sync-work-collection";
    await db.syncMeta.put({ id: source, blob });
    await report("apply", 0, 0);
    await processWork({
      action: "apply",
      source,
      hash,
      base: {
        id: "collection-base",
        account,
        file: selected.id,
        generation,
        mediaGeneration,
      },
    });
    if (outgoing) {
      await discardDriveUpload(outgoing.account, outgoing.name);
      await clearOutgoing();
    }
    await notify();
    await notify(undefined, "settings");
    if (heads.length > 1) {
      const pinned = await publishCollection(
        {
          id: outgoingId,
          account,
          parents,
          generation,
          mediaGeneration,
          hash,
          blob,
          name: `collection.${crypto.randomUUID()}.json.gz`,
        },
        files,
      );
      await db.syncMeta.put({
        id: "collection-base",
        account,
        file: pinned.id,
        generation,
        mediaGeneration,
      });
      for (const id of parents) remove.add(id);
    }
    await processWork({ action: "rebuild" });
  }

  const obsolete = copies.filter(({ id }) => remove.has(id));
  for (const file of obsolete) {
    checkCancelled();
    await deleteFile(file.id, account);
    files.splice(files.indexOf(file), 1);
  }
  if (obsolete.length) await saveDriveFiles(account, files);
  transfer.lastSuccess = Date.now();
  await transferMedia(account, files);
  await cleanupMedia();
  transfer.storage = driveStorageUsage(files);
  transfer.failures = 0;
  transfer.retryAt = 0;
  transfer.error = null;
  transfer.authorizationRequired = false;
  await browser.alarms.clear(retryAlarm);
  await persist();
}

async function recordFailure(error: unknown, reportError = true) {
  const code = errorCode(error);
  const status =
    error instanceof Error && "status" in error ? Number(error.status) : 0;
  transfer.authorizationRequired =
    status === 401 ||
    [
      "SYNC_AUTH_REQUIRED",
      "SYNC_AUTH_SCOPE",
      "SYNC_ACCOUNT_CHANGED",
      "SYNC_PERMISSION_REQUIRED",
    ].includes(code);
  if (reportError || transfer.authorizationRequired) transfer.error = code;
  const temporary =
    code === "SYNC_NETWORK" ||
    isLargeValueReadError(error) ||
    error instanceof TypeError ||
    (error instanceof Error &&
      "temporary" in error &&
      error.temporary === true) ||
    status === 408 ||
    status === 429 ||
    status >= 500;
  if (
    temporary &&
    !transfer.authorizationRequired &&
    transfer.automatic &&
    !cancelled
  ) {
    transfer.failures++;
    const retryAfter =
      error instanceof Error && "retryAfter" in error
        ? Number(error.retryAfter) || 0
        : 0;
    transfer.retryAt =
      Date.now() +
      Math.max(
        retryAfter,
        Math.min(300_000, 1000 * 2 ** Math.min(transfer.failures, 9)),
      );
    await browser.alarms.create(retryAlarm, { when: transfer.retryAt });
  }
  await persist();
}
export async function syncStatus(): Promise<SyncStatus> {
  await initialize();
  const auth = await authStatus();
  return {
    configured: auth.configured,
    connected: auth.account !== null,
    account: auth.account,
    automatic: transfer.automatic,
    lastSuccess: transfer.lastSuccess,
    pending,
    choice,
    mediaPending,
    progress,
    error: transfer.error,
    authorizationRequired:
      transfer.authorizationRequired || auth.authorizationRequired,
    storage: auth.account?.id === transfer.account ? transfer.storage : null,
    running: !!active || !!storageRequest || connecting || disconnecting,
  };
}
export async function refreshSyncStorage() {
  await initialize();
  if (active) return active;
  if (storageRequest) return storageRequest;
  if (connecting || disconnecting || transfer.retryAt > Date.now()) return;
  cancelled = false;
  storageRequest = navigator.locks.request(
    "srs-reader-google-sync",
    async () => {
      try {
        const account = await assertAccount();
        await report("storage", 0, 0);
        const files = await readDriveFiles(account.id);
        checkCancelled();
        await assertAccount();
        transfer.storage = driveStorageUsage(files);
        if (transfer.authorizationRequired) {
          transfer.authorizationRequired = false;
          transfer.error = null;
        }
        await persist();
      } catch (error) {
        await recordFailure(error);
        throw error;
      }
    },
  );
  try {
    await storageRequest;
  } finally {
    storageRequest = undefined;
    progress = null;
    await changed();
  }
}
export async function syncNow(decision?: SyncDecision) {
  await initialize();
  if (storageRequest) await storageRequest.catch(() => {});
  if (active) return active;
  if (connecting || disconnecting) return;
  cancelled = false;
  active = navigator.locks.request("srs-reader-google-sync", async () => {
    try {
      transfer.error = null;
      transfer.authorizationRequired = false;
      await changed();
      try {
        await synchronize(decision);
      } catch (error) {
        if (errorCode(error) !== "sync_collection_changed") throw error;
        await synchronize({ token: "", keep: "" });
      }
    } catch (error) {
      await recordFailure(error);
      throw error;
    } finally {
      progress = null;
      const release = await retainedHost?.catch(() => undefined);
      retainedHost = undefined;
      release?.();
      await db.syncMeta.where("id").startsWith("sync-work-").delete();
      await refreshPending();
    }
  });
  try {
    await active;
  } finally {
    active = undefined;
    await changed();
    if (!cancelled && !transfer.authorizationRequired && !choice && pending > 0)
      await scheduleEdits();
  }
}
export async function connectSync(replaceAccount = false) {
  await initialize();
  if (connecting || disconnecting || active || storageRequest) return;
  connecting = true;
  cancelled = false;
  await changed();
  try {
    const account = await connectGoogle(replaceAccount);
    checkCancelled();
    await bindAccount(account.id);
    transfer.authorizationRequired = false;
    transfer.error = null;
    transfer.failures = 0;
    transfer.retryAt = 0;
    await persist();
  } catch (error) {
    await recordFailure(error);
    throw error;
  } finally {
    connecting = false;
    await changed();
  }
  await syncNow();
}
export async function cancelSync() {
  cancelled = true;
  cancelDriveTransfers();
  await cancelSyncProcessing();
  await cancelGoogle();
  if (active) await active.catch(() => {});
  if (storageRequest) await storageRequest.catch(() => {});
  progress = null;
  await changed();
}
export async function disconnectSync() {
  await initialize();
  if (disconnecting) return;
  disconnecting = true;
  try {
    await cancelSync();
    await disconnectGoogle();
    choice = null;
    await clearDriveUploads();
    transfer.error = null;
    transfer.authorizationRequired = false;
    transfer.failures = 0;
    transfer.retryAt = 0;
    await browser.alarms.clear(editAlarm);
    await browser.alarms.clear(retryAlarm);
    await persist();
  } finally {
    disconnecting = false;
    await changed();
  }
}
export async function resetDrivePreview(account: string) {
  return driveStorageUsage(
    await listFiles(account, AbortSignal.timeout(10_000)),
  );
}

export async function resetExtension(confirmedAccount: string | null) {
  await initialize();
  if (connecting || disconnecting || active || storageRequest)
    throw new Error(t("reset_extension_sync_busy"));
  disconnecting = true;
  try {
    await srsWrite(async () => {
      if ((await db.importTasks.get("current"))?.status === "running")
        throw new Error(t("reset_extension_import_busy"));
      const auth = await authStatus();
      if ((auth.account?.id ?? null) !== confirmedAccount)
        throw new Error(t("reset_extension_account_changed"));
      if (!auth.account && (auth.boundAccount || transfer.account))
        throw new Error(t("reset_extension_reconnect"));
      if (auth.account) {
        // A partial Drive wipe must not prompt the automatic uploader to refill it.
        transfer.automatic = false;
        await persist();
        const { id } = auth.account;
        await transferConcurrently(await listFiles(id), (file) =>
          deleteFile(file.id, id),
        );
      }
      await clearDriveUploads();
      for (const name of await caches.keys()) await caches.delete(name);
      await db.transaction("rw", db.tables, async () => {
        await withoutSyncTracking(async () => {
          for (const table of db.tables) await table.clear();
        });
      });
      await disconnectGoogle();
      await browser.alarms.clear(editAlarm);
      await browser.alarms.clear(retryAlarm);
      await browser.storage.local.clear();
      await browser.storage.session.clear();
      transfer = emptyTransfer();
      pending = 0;
      choice = null;
      mediaPending = false;
    });
    await notify();
  } finally {
    disconnecting = false;
    await changed();
  }
}

export async function setAutomaticSync(enabled: boolean) {
  await initialize();
  if (disconnecting) return;
  transfer.automatic = enabled;
  await persist();
  if (enabled) void automaticSync(true).catch(console.warn);
  else {
    await browser.alarms.clear(editAlarm);
    await browser.alarms.clear(retryAlarm);
  }
}
export async function automaticSync(reconnect = false) {
  await initialize();
  if (
    !transfer.automatic ||
    (transfer.authorizationRequired &&
      !(reconnect && transfer.error === "SYNC_AUTH_REQUIRED")) ||
    active ||
    transfer.retryAt > Date.now() ||
    connecting ||
    storageRequest ||
    disconnecting
  )
    return;
  const auth = await authStatus();
  if (!auth.account) return;
  await navigator.locks.request(
    reviewSyncLock,
    { ifAvailable: true },
    async (lock) => {
      if (lock) await syncNow().catch(() => {});
    },
  );
}
export async function scheduleEdits() {
  await initialize();
  if (disconnecting) return;
  await refreshPending();
  await changed();
  if (
    transfer.automatic &&
    !transfer.authorizationRequired &&
    (await authStatus()).account
  )
    await browser.alarms.create(editAlarm, { when: Date.now() + 30_000 });
}
export function startSync() {
  if (started) return;
  started = true;
  browser.alarms.onAlarm.addListener((alarm) => {
    if ([periodicAlarm, editAlarm, retryAlarm].includes(alarm.name))
      void automaticSync().catch(console.warn);
  });
  globalThis.addEventListener("online", () => {
    void automaticSync(true).catch(console.warn);
  });
  void initialize()
    .then(async () => {
      await refreshPending();
      if (!(await browser.alarms.get(periodicAlarm)))
        await browser.alarms.create(periodicAlarm, { periodInMinutes: 5 });
      if (transfer.retryAt > Date.now())
        await browser.alarms.create(retryAlarm, { when: transfer.retryAt });
    })
    .catch(console.warn);
}
