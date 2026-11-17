import { db } from "@/platform/database/db";
import { authStatus, GoogleAuthError } from "@/sync/auth";
import { readSyncRows, replaceSyncRows } from "@/sync/metadata";
import {
  DriveError,
  driveTransferSignal,
  getStartPageToken,
  listChanges,
  listFiles,
  type DriveFile,
} from "@/sync/drive";

const indexId = "drive-cursor";
const fileRows = "drive-cursor:files:";
type DriveCursor = {
  id: typeof indexId;
  account: string;
  pageToken: string;
};
type DriveIndex = DriveCursor & { files: DriveFile[] };

async function writeIndex({ files, ...cursor }: DriveIndex) {
  await db.transaction("rw", db.syncMeta, async () => {
    await replaceSyncRows(fileRows, files);
    await db.syncMeta.put(cursor);
  });
}

async function assertAccount(account: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
  const current = (await authStatus()).account;
  if (signal?.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
  if (!current) throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
  if (current.id !== account) throw new GoogleAuthError("SYNC_ACCOUNT_CHANGED");
}

async function baseline(
  account: string,
  signal: AbortSignal,
): Promise<DriveIndex> {
  // Establish the cursor first so events during the full scan cannot be lost.
  const pageToken = await getStartPageToken(account, signal);
  const files = await listFiles(account, signal);
  return { id: indexId, account, files, pageToken };
}

async function applyChanges(
  index: DriveIndex,
  signal: AbortSignal,
): Promise<DriveIndex> {
  let files: Map<string, DriveFile> | undefined;
  let pageToken = index.pageToken;
  for (;;) {
    const page = await listChanges(index.account, pageToken, signal);
    if (page.changes?.length) {
      if (!files) {
        files = new Map();
        for (const file of index.files)
          if (!file.trashed) files.set(file.id, file);
      }
      for (const change of page.changes) {
        if (!change.fileId) throw new DriveError(502);
        if (change.removed || change.file?.trashed) {
          files.delete(change.fileId);
        } else {
          if (!change.file || change.file.id !== change.fileId)
            throw new DriveError(502);
          files.set(change.fileId, change.file);
        }
      }
    }
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }
    if (typeof page.newStartPageToken !== "string" || !page.newStartPageToken)
      throw new DriveError(502);
    return {
      ...index,
      files: files ? Array.from(files.values()) : index.files,
      pageToken: page.newStartPageToken,
    };
  }
}

export async function readDriveFiles(account: string): Promise<DriveFile[]> {
  const signal = driveTransferSignal();
  await assertAccount(account, signal);
  const cached = await db.transaction("r", db.syncMeta, async () => {
    const cursor = (await db.syncMeta.get(indexId)) as DriveCursor | undefined;
    if (cursor?.account !== account) return;
    return { ...cursor, files: await readSyncRows<DriveFile>(fileRows) };
  });
  let index: DriveIndex;
  try {
    const initial =
      cached?.account === account &&
      typeof cached.pageToken === "string" &&
      cached.pageToken &&
      Array.isArray(cached.files)
        ? cached
        : await baseline(account, signal);
    index = await applyChanges(initial, signal);
  } catch (error) {
    if (!(error instanceof DriveError) || error.status !== 410) throw error;
    // A rejected cursor invalidates the whole baseline, not just its last page.
    index = await applyChanges(await baseline(account, signal), signal);
  }
  await assertAccount(account, signal);
  if (cached?.files !== index.files) await writeIndex(index);
  else if (cached.pageToken !== index.pageToken)
    await db.syncMeta.put({ id: indexId, account, pageToken: index.pageToken });
  return index.files;
}

export async function saveDriveFiles(
  account: string,
  files: DriveFile[],
): Promise<void> {
  await assertAccount(account);
  await db.transaction("rw", db.syncMeta, async () => {
    const index = (await db.syncMeta.get(indexId)) as DriveCursor | undefined;
    if (index?.account !== account) return;
    // Own uploads/deletions are replayed idempotently by the next change poll.
    await writeIndex({
      ...index,
      files: files.filter((file) => !file.trashed),
    });
  });
}
