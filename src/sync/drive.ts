import { browser } from "wxt/browser";
import {
  accessToken,
  authStatus,
  GoogleAuthError,
  invalidateAccessToken,
} from "./auth";

export type DriveFile = {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
  createdTime?: string;
  size?: string;
  quotaBytesUsed?: string;
  trashed?: boolean;
};
export type DriveChange = {
  fileId: string;
  removed?: boolean;
  file?: DriveFile;
};
export type DriveChangePage = {
  changes?: DriveChange[];
  nextPageToken?: string;
  newStartPageToken?: string;
};
export class DriveError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfter = 0,
    public readonly code = "SYNC_DRIVE_ERROR",
    private readonly rateLimited = false,
  ) {
    super(code);
    this.name = "DriveError";
  }
  get temporary() {
    return (
      this.rateLimited ||
      this.status === 0 ||
      this.status === 408 ||
      this.status === 429 ||
      this.status >= 500
    );
  }
}

type Upload = {
  key: string;
  account: string;
  name: string;
  hash: string;
  properties: Record<string, string>;
  blob: Blob;
  session?: string;
  offset: number;
  updated: number;
};
const FIELDS = "id,name,appProperties,createdTime,size,quotaBytesUsed,trashed";
const CHUNK = 8 * 1024 * 1024;
let controller = new AbortController();
let database: Promise<IDBDatabase> | undefined;

export function cancelDriveTransfers(): void {
  controller.abort();
  controller = new AbortController();
}

export function driveTransferSignal(): AbortSignal {
  return controller.signal;
}

function uploadsDB(): Promise<IDBDatabase> {
  if (!database) {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    database = promise;
    // Deliberately separate from the user's backed-up content database.
    const request = indexedDB.open("SrsReaderGoogleDriveUploads", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("uploads", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }
  return database;
}

/** Forget local session capabilities and staged bytes, never remote files. */
export async function clearDriveUploads(): Promise<void> {
  cancelDriveTransfers();
  const db = await uploadsDB();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const transaction = db.transaction("uploads", "readwrite");
  transaction.objectStore("uploads").clear();
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
  await promise;
  await browser.storage.local.remove("syncDriveUploadProgress");
}

async function readUpload(key: string): Promise<Upload | undefined> {
  const db = await uploadsDB();
  const { promise, resolve, reject } = Promise.withResolvers<
    Upload | undefined
  >();
  const request = db.transaction("uploads").objectStore("uploads").get(key);
  request.onsuccess = () => resolve(request.result as Upload | undefined);
  request.onerror = () => reject(request.error);
  return promise;
}

async function persistUpload(upload: Upload, remove = false): Promise<void> {
  const db = await uploadsDB();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const transaction = db.transaction("uploads", "readwrite");
  const store = transaction.objectStore("uploads");
  if (remove) store.delete(upload.key);
  else store.put(upload);
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
  await promise;
  // Small persisted progress record also makes interrupted transfer inspection
  // possible without reading the upload blob. Never stores a bearer credential.
  if (remove) await browser.storage.local.remove("syncDriveUploadProgress");
  else
    await browser.storage.local.set({
      syncDriveUploadProgress: {
        account: upload.account,
        name: upload.name,
        done: upload.offset,
        total: upload.blob.size,
        updated: upload.updated,
      },
    });
}

async function accountId(): Promise<string> {
  const account = (await authStatus()).account;
  if (!account) throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
  return account.id;
}

async function delay(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const abort = () => {
    clearTimeout(timer);
    reject(new GoogleAuthError("SYNC_AUTH_CANCELLED"));
  };
  const timer = setTimeout(() => {
    signal.removeEventListener("abort", abort);
    resolve();
  }, milliseconds);
  signal.addEventListener("abort", abort, { once: true });
  await promise;
}

/** Requests never follow redirects carrying an Authorization header. */
async function request(
  url: string,
  init: RequestInit,
  account: string,
  signal: AbortSignal,
  accepted: number[] = [],
): Promise<Response> {
  let renewed = false;
  for (let attempt = 0; ; attempt += 1) {
    if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
    if ((await accountId()) !== account)
      throw new GoogleAuthError("SYNC_ACCOUNT_CHANGED");
    const token = await accessToken();
    if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
        signal,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
      // A PUT's server-side result may be unknown: caller probes its session
      // before resending, rather than blindly replaying a media chunk.
      throw new DriveError(0, 0, "SYNC_NETWORK");
    }
    if (response.status === 401 && !renewed) {
      renewed = true;
      await invalidateAccessToken(token);
      continue;
    }
    if (response.status === 401)
      throw new GoogleAuthError("SYNC_AUTH_REQUIRED", 401);
    if (response.ok || accepted.includes(response.status)) return response;
    const retryHeader = response.headers.get("Retry-After");
    const seconds = Number(retryHeader);
    const retryAfter = retryHeader
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Math.max(0, Date.parse(retryHeader) - Date.now())
      : 0;
    let rateLimited = false;
    if (response.status === 403) {
      const body = (await response.json().catch(() => null)) as {
        error?: { errors?: { reason?: string }[] };
      } | null;
      rateLimited =
        body?.error?.errors?.some(
          ({ reason }) =>
            reason === "rateLimitExceeded" ||
            reason === "userRateLimitExceeded",
        ) ?? false;
    }
    const error = new DriveError(
      response.status,
      Number.isFinite(retryAfter) ? retryAfter : 0,
      "SYNC_DRIVE_ERROR",
      rateLimited,
    );
    // Read requests are safely replayable. Chunk PUTs and session creation are
    // left to persisted resumable recovery and the coordinator's backoff.
    if (
      (init.method === undefined || init.method === "GET") &&
      error.temporary &&
      attempt < 2
    ) {
      // Long provider cooldowns belong to the persisted coordinator alarm;
      // never retry earlier than Retry-After or keep a worker sleeping for it.
      if (error.retryAfter > 60_000) throw error;
      await delay(error.retryAfter || 1000 * 2 ** attempt, signal);
      continue;
    }
    throw error;
  }
}

export async function listFiles(
  account?: string,
  signal = controller.signal,
): Promise<DriveFile[]> {
  const expectedAccount = account ?? (await accountId());
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: "trashed = false",
      pageSize: "1000",
      fields: `nextPageToken,files(${FIELDS})`,
      ...(pageToken ? { pageToken } : {}),
    });
    const response = await request(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      {},
      expectedAccount,
      signal,
    );
    let page: { files?: DriveFile[]; nextPageToken?: string };
    try {
      page = (await response.json()) as typeof page;
    } catch {
      if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
      throw new DriveError(0, 0, "SYNC_NETWORK");
    }
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

export async function getStartPageToken(
  account: string,
  signal = controller.signal,
): Promise<string> {
  const response = await request(
    "https://www.googleapis.com/drive/v3/changes/startPageToken?fields=startPageToken",
    {},
    account,
    signal,
  );
  let page: { startPageToken?: string };
  try {
    page = (await response.json()) as typeof page;
  } catch {
    if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
    throw new DriveError(0, 0, "SYNC_NETWORK");
  }
  if (typeof page.startPageToken !== "string" || !page.startPageToken)
    throw new DriveError(502);
  return page.startPageToken;
}

export async function listChanges(
  account: string,
  pageToken: string,
  signal = controller.signal,
): Promise<DriveChangePage> {
  const params = new URLSearchParams({
    pageToken,
    spaces: "appDataFolder",
    includeRemoved: "true",
    pageSize: "1000",
    fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FIELDS}))`,
  });
  const response = await request(
    `https://www.googleapis.com/drive/v3/changes?${params}`,
    {},
    account,
    signal,
  );
  try {
    return (await response.json()) as DriveChangePage;
  } catch {
    if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
    throw new DriveError(0, 0, "SYNC_NETWORK");
  }
}

export async function downloadFile(id: string): Promise<Blob> {
  const signal = controller.signal;
  const account = await accountId();
  const response = await request(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
    {},
    account,
    signal,
  );
  try {
    return await response.blob();
  } catch {
    if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
    throw new DriveError(0, 0, "SYNC_NETWORK");
  }
}

function sessionURL(location: string): string {
  const url = new URL(location);
  // The provider's Location is not permission to send a bearer to another host.
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.googleapis.com" ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/upload/drive/")
  )
    throw new DriveError(502);
  return url.href;
}

async function completed(
  response: Response,
  upload: Upload,
): Promise<DriveFile> {
  let file: DriveFile;
  try {
    file = (await response.json()) as DriveFile;
  } catch {
    throw new DriveError(0, 0, "SYNC_NETWORK");
  }
  if (!file.id || file.name !== upload.name) throw new DriveError(502);
  await persistUpload(upload, true);
  return file;
}

async function probe(
  upload: Upload,
  signal: AbortSignal,
): Promise<DriveFile | undefined> {
  const response = await request(
    upload.session!,
    {
      method: "PUT",
      headers: { "Content-Range": `bytes */${upload.blob.size}` },
      body: new Blob(),
    },
    upload.account,
    signal,
    [308, 404, 410],
  );
  if (response.status === 404 || response.status === 410) {
    delete upload.session;
    upload.offset = 0;
  } else if (response.status === 308) {
    const range = response.headers.get("Range");
    if (range && !/^bytes=0-\d+$/.test(range)) throw new DriveError(502);
    upload.offset = range ? Number(range.split("-")[1]) + 1 : 0;
    if (upload.offset > upload.blob.size || upload.offset < 0)
      throw new DriveError(502);
  } else {
    return completed(response, upload);
  }
  upload.updated = Date.now();
  await persistUpload(upload);
  return undefined;
}

export async function uploadFile(
  name: string,
  blob: Blob,
  properties: Record<string, string>,
): Promise<DriveFile> {
  const signal = controller.signal;
  const account = await accountId();
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
  );
  const hash = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const key = JSON.stringify([account, name]);
  let upload = await readUpload(key);
  if (
    upload &&
    (upload.hash !== hash ||
      JSON.stringify(Object.entries(upload.properties).sort()) !==
        JSON.stringify(Object.entries(properties).sort()))
  ) {
    // Immutable publication names must never silently acquire different bytes.
    throw new DriveError(409);
  }
  upload ??= {
    key,
    account,
    name,
    hash,
    properties,
    blob,
    offset: 0,
    updated: Date.now(),
  };
  await persistUpload(upload);
  if (upload.session) {
    const file = await probe(upload, signal);
    if (file) return file;
  }
  for (;;) {
    if (!upload.session) {
      const params = new URLSearchParams({
        uploadType: "resumable",
        fields: FIELDS,
      });
      const response = await request(
        `https://www.googleapis.com/upload/drive/v3/files?${params}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": blob.type || "application/octet-stream",
            "X-Upload-Content-Length": String(blob.size),
          },
          body: JSON.stringify({
            name,
            parents: ["appDataFolder"],
            appProperties: properties,
          }),
        },
        account,
        signal,
      );
      const location = response.headers.get("Location");
      if (!location) throw new DriveError(502);
      upload.session = sessionURL(location);
      upload.offset = 0;
      upload.updated = Date.now();
      await persistUpload(upload);
    }
    const start = upload.offset;
    const end = Math.min(start + CHUNK, blob.size);
    let response: Response;
    try {
      response = await request(
        upload.session,
        {
          method: "PUT",
          headers: {
            "Content-Type": blob.type || "application/octet-stream",
            "Content-Range":
              blob.size === 0
                ? "bytes */0"
                : `bytes ${start}-${end - 1}/${blob.size}`,
          },
          body: upload.blob.slice(start, end),
        },
        account,
        signal,
        [308, 404, 410],
      );
    } catch (error) {
      if (error instanceof DriveError && error.temporary) {
        // Persisted offset remains the last acknowledged byte. Next invocation
        // probes the server, including the case where the final response died.
        upload.updated = Date.now();
        await persistUpload(upload);
      }
      throw error;
    }
    if (response.status === 404 || response.status === 410) {
      delete upload.session;
      upload.offset = 0;
    } else if (response.status === 308) {
      const range = response.headers.get("Range");
      if (!range || !/^bytes=0-\d+$/.test(range)) throw new DriveError(502);
      const next = Number(range.split("-")[1]) + 1;
      if (next <= start || next > end) throw new DriveError(502);
      upload.offset = next;
    } else {
      return completed(response, upload);
    }
    upload.updated = Date.now();
    await persistUpload(upload);
  }
}

/** Only the coordinator decides retention; uploads never delete older files. */
export async function deleteFile(id: string): Promise<void> {
  const signal = controller.signal;
  const account = await accountId();
  await request(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    account,
    signal,
    [404],
  );
}
