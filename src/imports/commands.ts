import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { browser, type Browser } from "wxt/browser";
import type { Request as ExampleRequest } from "@/examples/contracts";
import type { ExamplesResult } from "@/examples/model";
import {
  syncWorkError,
  type SyncWork,
  type SyncWorkMessage,
} from "@/sync/processing";
import type { SyncProgress } from "@/sync/model";

let firefoxHost: HTMLIFrameElement | undefined;
const hosts = new Set<Browser.runtime.Port>();
const readyListeners = new Set<() => void>();
const exampleQueries = new Map<
  string,
  { resolve: (value: ExamplesResult) => void; reject: (error: Error) => void }
>();
let exampleIdleTimer: ReturnType<typeof setTimeout> | undefined;
const syncJobs = new Map<
  string,
  {
    promise: Promise<void>;
    host?: Browser.runtime.Port;
    cancelled?: boolean;
    resolve: () => void;
    reject: (error: Error) => void;
    report: (progress: SyncProgress) => void;
    loadMedia?: (hash: string) => Promise<Blob | undefined>;
  }
>();
let syncUsers = 0;

export async function retainSyncHost() {
  syncUsers++;
  try {
    await handleImports("runImport");
  } catch (error) {
    syncUsers--;
    throw error;
  }
  return () => {
    syncUsers--;
    void handleImports("closeImportHost").catch(console.error);
  };
}

export async function processSync(
  request: SyncWork,
  report: (progress: SyncProgress) => void = () => {},
  loadMedia?: (hash: string) => Promise<Blob | undefined>,
) {
  const id = crypto.randomUUID();
  const pending = Promise.withResolvers<void>();
  syncJobs.set(id, { ...pending, report, loadMedia });
  try {
    void handleImports("runImport")
      .then(() => {
        const job = syncJobs.get(id);
        if (!job || job.cancelled) return;
        job.host = hosts.values().next().value!;
        job.host.postMessage({ type: "sync", id, request });
      })
      .catch(pending.reject);
    await pending.promise;
  } finally {
    syncJobs.delete(id);
    await db.syncMeta.where("id").startsWith(`sync-worker-${id}-`).delete();
    void handleImports("closeImportHost").catch(console.error);
  }
}

export async function cancelSyncProcessing() {
  const pending: Promise<void>[] = [];
  for (const [id, job] of syncJobs) {
    pending.push(job.promise);
    if (job.cancelled) continue;
    job.cancelled = true;
    if (job.host) {
      try {
        job.host.postMessage({ type: "sync-cancel", id });
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } else {
      job.reject(
        Object.assign(new Error("sync_cancelled"), {
          code: "SYNC_AUTH_CANCELLED",
        }),
      );
    }
  }
  await Promise.allSettled(pending);
}

export function connectImportHost(port: Browser.runtime.Port) {
  if (port.name !== "import-host") return;
  if (port.sender?.url !== browser.runtime.getURL("/imports.html")) return;
  port.onMessage.addListener((message) => {
    if (message?.type === "sync-result") {
      const result = message as SyncWorkMessage;
      const job = syncJobs.get(result.id);
      if (!job) return;
      if (job.cancelled) {
        if (result.cancelled)
          job.reject(
            Object.assign(new Error("sync_cancelled"), {
              code: "SYNC_AUTH_CANCELLED",
            }),
          );
        return;
      }
      if (result.progress) job.report(result.progress);
      if (result.media) {
        const hash = result.media;
        void (async () => {
          try {
            if (!job.loadMedia) throw new Error("sync_invalid_media");
            const blob = await job.loadMedia(hash);
            if (syncJobs.get(result.id) !== job || job.cancelled) return;
            if (blob)
              await db.syncMeta.put({
                id: `sync-worker-${result.id}-${hash}`,
                blob,
              });
            port.postMessage({
              type: "sync-media",
              id: result.id,
              media: hash,
            });
          } catch (error) {
            if (syncJobs.has(result.id))
              port.postMessage({
                type: "sync-media",
                id: result.id,
                media: hash,
                error: syncWorkError(error),
              });
          }
        })();
      }
      if (result.error)
        job.reject(
          Object.assign(new Error(result.error.message), result.error),
        );
      else if (result.done) job.resolve();
      return;
    }
    if (message?.type === "examples-result") {
      const pending = exampleQueries.get(message.id);
      if (message.error) pending?.reject(new Error(message.error));
      else pending?.resolve(message.value);
      return;
    }
    if (message?.type !== "ready") return;
    hosts.add(port);
    for (const ready of readyListeners) ready();
  });
  port.onDisconnect.addListener(() => {
    hosts.delete(port);
    if (!hosts.size) {
      const error = new Error(t("background_host_failed"));
      for (const pending of exampleQueries.values()) pending.reject(error);
      for (const pending of syncJobs.values()) pending.reject(error);
    }
  });
}

export function queryExamples(
  request: Extract<ExampleRequest, { action: "examples" }>,
) {
  clearTimeout(exampleIdleTimer);
  exampleIdleTimer = undefined;
  const id = crypto.randomUUID();
  const { promise, resolve, reject } = Promise.withResolvers<ExamplesResult>();
  exampleQueries.set(id, { resolve, reject });
  void handleImports("runImport")
    .then(() =>
      hosts
        .values()
        .next()
        .value!.postMessage({ type: "examples", id, request }),
    )
    .catch((error) => exampleQueries.get(id)?.reject(error));
  return promise.finally(() => {
    exampleQueries.delete(id);
    if (exampleQueries.size) return;
    clearTimeout(exampleIdleTimer);
    exampleIdleTimer = setTimeout(
      () => {
        exampleIdleTimer = undefined;
        void handleImports("closeImportHost").catch(console.error);
      },
      // Release the worker before MV3's 30-second idle shutdown.
      hosts.size ? 20000 : 0,
    );
  });
}

async function openOffscreenHost(url: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await browser.offscreen.createDocument({
        url,
        reasons: ["WORKERS"],
        justification: t("background_work_reason"),
      });
      return;
    } catch (error) {
      // Chromium closes a document that failed its first load before rejecting.
      if (!(error instanceof Error) || error.message !== "Page failed to load.")
        throw error;
      if (attempt > 0)
        throw Object.assign(
          new Error(t("background_host_failed"), { cause: error }),
          {
            code: "background_host_failed",
            temporary: true,
          },
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

export function handleImports(action: "runImport" | "closeImportHost") {
  return navigator.locks.request("srs-reader-import-host", async () => {
    const task = await db.importTasks.get("current");
    const running = task?.status === "running";
    const needed =
      running ||
      exampleQueries.size > 0 ||
      exampleIdleTimer !== undefined ||
      syncJobs.size > 0 ||
      syncUsers > 0;
    if (action === "closeImportHost" && needed) return;
    const url = browser.runtime.getURL("/imports.html");
    try {
      if (import.meta.env.BROWSER === "firefox") {
        if (!needed) {
          firefoxHost?.remove();
          firefoxHost = undefined;
          return;
        }
        if (!firefoxHost) {
          const frame = document.createElement("iframe");
          frame.hidden = true;
          frame.src = url;
          firefoxHost = frame;
          await new Promise<void>((resolve, reject) => {
            frame.onload = () => resolve();
            frame.onerror = () =>
              reject(new Error(t("background_host_failed")));
            document.body.append(frame);
          });
        }
      } else {
        const contexts = await browser.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
          documentUrls: [url],
        });
        if (!needed) {
          if (contexts.length) await browser.offscreen.closeDocument();
          return;
        }
        if (!contexts.length) await openOffscreenHost(url);
      }
      if (!hosts.size) {
        if (running)
          await db.importTasks.update("current", {
            progress: { phase: t("starting_import"), done: 0, total: 0 },
          });
        await new Promise<void>((resolve, reject) => {
          const ready = () => {
            clearTimeout(timer);
            readyListeners.delete(ready);
            resolve();
          };
          const timer = setTimeout(() => {
            readyListeners.delete(ready);
            reject(new Error(t("background_host_failed")));
          }, 10000);
          readyListeners.add(ready);
          if (hosts.size) ready();
        });
      }
      if (running) hosts.values().next().value!.postMessage({ type: "run" });
    } catch (error) {
      await db.importTasks
        .where("id")
        .equals("current")
        .filter(
          (current) =>
            current.runId === task?.runId && current.status === "running",
        )
        .modify({
          status: "error",
          progress: undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
  });
}
