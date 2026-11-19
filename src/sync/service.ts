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
  accessToken,
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
  downloadFile,
  driveTransferSignal,
  listFiles,
  uploadFile,
  type DriveFile,
} from "@/sync/drive";
import { readDriveFiles, saveDriveFiles } from "@/sync/drive-index";
import { findLocalMedia } from "@/sync/media";
import {
  clearOutgoing,
  outgoingId,
  outgoingMedia,
  readSyncRows,
} from "@/sync/metadata";
import { transferConcurrently } from "@/sync/concurrency";
import {
  batchMedia,
  createMediaDownloader,
  mediaBundleName,
  mediaHashes,
  packMediaBundle,
} from "@/sync/media-bundles";
import {
  type SyncIdentity,
  type SyncProgress,
  type SyncRecord,
  type SyncStatus,
  type SyncStorage,
  type SyncTransferState,
} from "@/sync/model";
import { isLargeValueReadError, type PackedSync } from "@/sync/processing";
import {
  markPublished,
  onSyncEdit,
  pendingCount,
  pendingStudyChanges,
  withoutSyncTracking,
} from "@/sync/tracking";
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
  received: {},
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
let trackingReady: Promise<void> | undefined;
let pending = 0;
let pendingRequest: Promise<void> | undefined;
let pendingDirty = false;

function refreshPending() {
  if (!trackingReady) return Promise.resolve();
  pendingDirty = true;
  pendingRequest ??= (async () => {
    while (pendingDirty) {
      pendingDirty = false;
      const count = await pendingStudyChanges();
      if (pending !== count) {
        pending = count;
        await changed();
      }
    }
  })().finally(() => {
    pendingRequest = undefined;
    if (pendingDirty) void refreshPending().catch(console.warn);
  });
  return pendingRequest;
}

function prepareTracking() {
  trackingReady ??= processSync({ action: "initialize" })
    .then(() => refreshPending())
    .catch((error) => {
      trackingReady = undefined;
      throw error;
    });
  return trackingReady;
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
    transfer = { ...emptyTransfer(), ...stored };
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
function revision(file: DriveFile) {
  const value = Number(file.appProperties?.revision);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
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
function latestSnapshots(files: DriveFile[]) {
  const latest = new Map<string, DriveFile>();
  for (const file of files) {
    const device = file.appProperties?.device;
    if (
      file.appProperties?.srsKind !== "snapshot" ||
      !device ||
      !revision(file)
    )
      continue;
    const current = latest.get(device);
    if (
      !current ||
      revision(file) > revision(current) ||
      (revision(file) === revision(current) &&
        file.id.localeCompare(current.id) < 0)
    )
      latest.set(device, file);
  }
  return latest;
}
async function bindAccount(account: string) {
  if (transfer.account === account) return;
  await processWork({
    action: "prepare",
    replaceAccount: transfer.account !== null,
  });
  await clearOutgoing();
  await clearDriveUploads();
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
async function synchronize() {
  const account = await assertAccount();
  const signal = driveTransferSignal();
  await report("check", 0, 0);
  await prepareTracking();
  await accessToken(account.id);
  checkCancelled();
  const files = await readDriveFiles(account.id);
  let filesChanged = false;
  transfer.storage = driveStorageUsage(files);
  const latest = latestSnapshots(files);
  const mediaFiles = new Map<string, DriveFile>();
  for (const file of files) {
    for (const hash of mediaHashes(file)) mediaFiles.set(hash, file);
  }
  const downloadMedia = createMediaDownloader(account.id, signal);
  const loadMedia = async (hash: string, record: SyncRecord) => {
    const local = await findLocalMedia(record);
    if (local) return local;
    checkCancelled();
    const file = mediaFiles.get(hash);
    if (!file) throw new Error(t("sync_invalid_media"));
    return downloadMedia(file, hash);
  };
  const incoming: string[] = [];
  const received = { ...transfer.received };
  const localIdentity = (await db.syncMeta.get("identity")) as SyncIdentity;
  const downloads = [...latest.entries()].filter(
    ([device, file]) =>
      Math.max(
        received[device] ?? 0,
        device === localIdentity.device ? localIdentity.published : 0,
      ) < revision(file),
  );
  for (const [device, file] of downloads) {
    checkCancelled();
    const key = `sync-work-${crypto.randomUUID()}`;
    await report("download", 0, 0, "bytes");
    await db.syncMeta.put({
      id: key,
      blob: await downloadFile(file.id, account.id, (done, total) => {
        void report("download", done, total, "bytes").catch(console.warn);
      }),
    });
    await report("prepare", 0, 0);
    await processWork(
      {
        action: "unpack",
        key,
        device,
        revision: revision(file),
      },
      loadMedia,
    );
    incoming.push(key);
    received[device] = revision(file);
  }
  checkCancelled();
  if (incoming.length) {
    await report("merge", 0, 0);
    await processWork({ action: "merge", keys: incoming });
    transfer.received = received;
    await persist();
    await notify();
    await notify(undefined, "settings");
  }
  await processWork({ action: "rebuild" });
  checkCancelled();
  const identity = (await db.syncMeta.get("identity")) as SyncIdentity;
  const [outgoing] = await db.syncMeta
    .where("id")
    .anyOf("outgoing", outgoingId)
    .limit(1)
    .primaryKeys();
  if (
    (await pendingCount()) > 0 ||
    outgoing ||
    identity.published === 0 ||
    !latest.has(identity.device)
  ) {
    await report("upload", 0, 0);
    await processWork({ action: "pack", account: account.id });
    const snapshot = (await db.syncMeta.get(outgoingId)) as PackedSync;
    const missingMedia = (
      await readSyncRows<[string, Blob]>(outgoingMedia)
    ).filter(([hash]) => !mediaFiles.has(hash));
    await report("media", 0, missingMedia.length);
    let done = 0;
    await transferConcurrently(batchMedia(missingMedia), async (batch) => {
      checkCancelled();
      let file: DriveFile;
      if (batch.length === 1) {
        const [hash, blob] = batch[0]!;
        file = await uploadFile(
          `media.${hash}`,
          blob,
          { srsKind: "media", hash },
          account.id,
        );
      } else {
        const blob = await packMediaBundle(batch, signal);
        checkCancelled();
        file = await uploadFile(
          await mediaBundleName(batch),
          blob,
          {
            srsKind: "media-bundle",
            ...Object.fromEntries(batch.map(([hash]) => [`m${hash}`, "1"])),
          },
          account.id,
        );
      }
      for (const [hash] of batch) mediaFiles.set(hash, file);
      files.push(file);
      filesChanged = true;
      done += batch.length;
      await report("media", done, missingMedia.length);
    });
    checkCancelled();
    await assertAccount();
    await report("upload", 0, 1);
    const existing = files.find(
      (file) =>
        file.appProperties?.srsKind === "snapshot" &&
        file.appProperties.device === snapshot.device &&
        revision(file) === snapshot.revision,
    );
    const uploaded =
      existing ??
      (await uploadFile(
        `snapshot.${snapshot.device}.${snapshot.revision}.json.gz`,
        snapshot.blob,
        {
          srsKind: "snapshot",
          device: snapshot.device,
          revision: String(snapshot.revision),
          format: "1",
        },
        account.id,
      ));
    // Acknowledge only the durable captured revision, never edits made during upload.
    await markPublished(snapshot.revision);
    transfer.received[snapshot.device] = Math.max(
      transfer.received[snapshot.device] ?? 0,
      snapshot.revision,
    );
    await clearOutgoing();
    await report("upload", 1, 1);
    if (!existing) {
      files.push(uploaded);
      filesChanged = true;
    }
  }
  // Cleanup retries independently of publication acknowledgement after restart.
  const own = files
    .filter(
      (file) =>
        file.appProperties?.srsKind === "snapshot" &&
        file.appProperties.device === identity.device,
    )
    .sort((a, b) => revision(b) - revision(a) || a.id.localeCompare(b.id));
  const retainedRevisions = new Set<number>();
  const retainedFiles = new Set<string>();
  for (const file of own) {
    const candidate = revision(file);
    if (!retainedRevisions.has(candidate) && retainedRevisions.size < 2) {
      retainedRevisions.add(candidate);
      retainedFiles.add(file.id);
    }
  }
  for (const old of own.filter((file) => !retainedFiles.has(file.id))) {
    checkCancelled();
    await deleteFile(old.id, account.id);
    files.splice(files.indexOf(old), 1);
    filesChanged = true;
  }
  if (filesChanged) await saveDriveFiles(account.id, files);
  await clearDriveUploads();
  transfer.storage = driveStorageUsage(files);
  transfer.lastSuccess = Date.now();
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
        await accessToken(account.id);
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
export async function syncNow() {
  await initialize();
  if (storageRequest) await storageRequest.catch(() => {});
  if (active) return active;
  if (connecting || disconnecting) return;
  cancelled = false;
  active = navigator.locks.request("srs-reader-google-sync", async () => {
    try {
      transfer.error = null;
      await changed();
      const release = await retainSyncHost();
      try {
        await synchronize();
      } finally {
        release();
      }
    } catch (error) {
      await recordFailure(error);
      throw error;
    } finally {
      progress = null;
      await db.syncMeta.where("id").startsWith("sync-work-").delete();
      await refreshPending();
    }
  });
  try {
    await active;
  } finally {
    active = undefined;
    await changed();
    if (
      !cancelled &&
      !transfer.authorizationRequired &&
      (await pendingCount()) > 0
    )
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
    await Promise.allSettled([trackingReady, pendingRequest]);
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
        await accessToken(auth.account.id);
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
      trackingReady = undefined;
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
  if (enabled) void automaticSync().catch(console.warn);
  else {
    await browser.alarms.clear(editAlarm);
    await browser.alarms.clear(retryAlarm);
  }
}
export async function automaticSync() {
  await initialize();
  if (
    !transfer.automatic ||
    transfer.authorizationRequired ||
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
  await changed();
  void prepareTracking().then(refreshPending).catch(console.warn);
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
  onSyncEdit(() => {
    void scheduleEdits().catch(console.warn);
  });
  globalThis.addEventListener("online", () => {
    void automaticSync().catch(console.warn);
  });
  void initialize()
    .then(async () => {
      void prepareTracking().catch(recordFailure).catch(console.warn);
      if (!(await browser.alarms.get(periodicAlarm)))
        await browser.alarms.create(periodicAlarm, { periodInMinutes: 5 });
      if (transfer.retryAt > Date.now())
        await browser.alarms.create(retryAlarm, { when: transfer.retryAt });
    })
    .catch(console.warn);
}
