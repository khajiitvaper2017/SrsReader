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
  type SyncScope,
  type SyncStatus,
  type SyncStorage,
  type SyncTransferState,
} from "@/sync/model";
import { isLargeValueReadError, type PackedSync } from "@/sync/processing";
import {
  markPublished,
  hasPendingMedia,
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
  receivedMedia: {},
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
    transfer = {
      ...emptyTransfer(),
      ...stored,
      receivedMedia: { ...(stored?.receivedMedia ?? stored?.received) },
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
const snapshotKind = (scope: SyncScope) => `${scope}-snapshot`;
function snapshotScope(file: DriveFile) {
  const properties = file.appProperties;
  if (properties?.srsKind === "media-snapshot") return "media";
  if (properties?.srsKind === "snapshot")
    return properties.scope === "study" ? "study" : "legacy";
}
function latestSnapshots(files: DriveFile[], scope: SyncScope) {
  const latest = new Map<string, DriveFile>();
  for (const file of files) {
    const device = file.appProperties?.device;
    const source = snapshotScope(file);
    if ((source !== "legacy" && source !== scope) || !device || !revision(file))
      continue;
    const current = latest.get(device);
    if (
      !current ||
      revision(file) > revision(current) ||
      (revision(file) === revision(current) &&
        (source === snapshotScope(current)
          ? file.id.localeCompare(current.id) < 0
          : source === scope))
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
async function uploadSnapshotMedia(account: string, files: DriveFile[]) {
  const known = new Set(files.flatMap(mediaHashes));
  const missingMedia = (
    await readSyncRows<[string, Blob]>(outgoingMedia)
  ).filter(([hash]) => !known.has(hash));
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
        account,
      );
    } else {
      const blob = await packMediaBundle(batch, driveTransferSignal());
      checkCancelled();
      file = await uploadFile(
        await mediaBundleName(batch),
        blob,
        {
          srsKind: "media-bundle",
          ...Object.fromEntries(batch.map(([hash]) => [`m${hash}`, "1"])),
        },
        account,
      );
    }
    files.push(file);
    done += batch.length;
    await report("media", done, missingMedia.length);
  });
  checkCancelled();
}

async function synchronize() {
  const account = (await assertAccount()).id;
  await report("check", 0, 0);
  await prepareTracking();
  await accessToken(account);
  checkCancelled();
  const files = await readDriveFiles(account);
  transfer.storage = driveStorageUsage(files);
  let filesChanged = false;
  const downloaded = new Map<string, string>();

  async function exchange(scope: SyncScope) {
    const latest = latestSnapshots(files, scope);
    const received = {
      ...(scope === "study" ? transfer.received : transfer.receivedMedia),
    };
    const identity = (await db.syncMeta.get("identity")) as SyncIdentity;
    const incoming: string[] = [];
    const mediaFiles = new Map<string, DriveFile>();
    if (scope === "media")
      for (const file of files)
        for (const hash of mediaHashes(file)) mediaFiles.set(hash, file);
    const downloadMedia = createMediaDownloader(account, driveTransferSignal());
    const loadMedia = async (hash: string) => {
      checkCancelled();
      const file = mediaFiles.get(hash);
      if (!file) throw new Error(t("sync_invalid_media"));
      return downloadMedia(file, hash);
    };
    for (const [device, file] of latest) {
      const version = revision(file);
      const published =
        scope === "study" && device === identity.device
          ? identity.published
          : 0;
      if (version <= Math.max(received[device] ?? 0, published)) continue;
      checkCancelled();
      let source = downloaded.get(file.id);
      if (!source) {
        source = `sync-work-${crypto.randomUUID()}`;
        await report("download", 0, 0, "bytes");
        await db.syncMeta.put({
          id: source,
          blob: await downloadFile(file.id, account, (done, total) => {
            void report("download", done, total, "bytes").catch(console.warn);
          }),
        });
        downloaded.set(file.id, source);
      }
      const key = `${source}:${scope}`;
      await report("prepare", 0, 0);
      await processWork(
        { action: "unpack", key, source, device, revision: version, scope },
        loadMedia,
      );
      incoming.push(key);
      received[device] = version;
    }
    if (incoming.length) {
      await report("merge", 0, 0);
      await processWork({ action: "merge", keys: incoming, scope });
      if (scope === "study") transfer.received = received;
      else transfer.receivedMedia = received;
      await persist();
      await notify();
      if (scope === "study") await notify(undefined, "settings");
    }

    const own = latest.get(identity.device);
    const outgoing = await db.syncMeta
      .where("id")
      .equals(outgoingId(scope))
      .count();
    const pending =
      scope === "study"
        ? !identity.published || !own || (await pendingCount()) > 0
        : await hasPendingMedia(own ? revision(own) : 0);
    if (!outgoing && !pending) return;
    await report("upload", 0, 0);
    await processWork({ action: "pack", account, scope });
    const snapshot = (await db.syncMeta.get(outgoingId(scope))) as PackedSync;
    const existing = files.find(
      (file) =>
        snapshotScope(file) === scope &&
        file.appProperties?.device === snapshot.device &&
        revision(file) === snapshot.revision,
    );
    if (!existing) {
      if (scope === "media") await uploadSnapshotMedia(account, files);
      checkCancelled();
      await assertAccount();
      await report("upload", 0, 1);
      files.push(
        await uploadFile(
          `${snapshotKind(scope)}.${snapshot.device}.${snapshot.revision}.json.gz`,
          snapshot.blob,
          {
            ...(scope === "study"
              ? { srsKind: "snapshot", scope: "study" }
              : { srsKind: "media-snapshot" }),
            device: snapshot.device,
            revision: String(snapshot.revision),
            format: "1",
          },
          account,
        ),
      );
      await saveDriveFiles(account, files);
    }
    // Acknowledge only the durable captured revision, never later edits.
    if (scope === "study") await markPublished(snapshot.revision);
    const acknowledged =
      scope === "study" ? transfer.received : transfer.receivedMedia;
    acknowledged[snapshot.device] = Math.max(
      acknowledged[snapshot.device] ?? 0,
      snapshot.revision,
    );
    await persist();
    await clearOutgoing(scope);
    await report("upload", 1, 1);
  }

  await exchange("study");
  await refreshPending();
  await processWork({ action: "rebuild" });
  await exchange("media");

  // Keep a recovery copy for each stream. Legacy snapshots may still hold
  // the only copy of media from before the streams were split.
  const identity = (await db.syncMeta.get("identity")) as SyncIdentity;
  for (const scope of ["legacy", "study", "media"]) {
    const own = files
      .filter(
        (file) =>
          snapshotScope(file) === scope &&
          file.appProperties?.device === identity.device,
      )
      .sort((a, b) => revision(b) - revision(a) || a.id.localeCompare(b.id));
    const retained = new Set<number>();
    for (const file of own) {
      if (retained.size < 2 && !retained.has(revision(file))) {
        retained.add(revision(file));
        continue;
      }
      checkCancelled();
      await deleteFile(file.id, account);
      files.splice(files.indexOf(file), 1);
      filesChanged = true;
    }
  }
  if (filesChanged) await saveDriveFiles(account, files);
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
