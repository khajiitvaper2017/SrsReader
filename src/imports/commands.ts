import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { browser, type Browser } from "wxt/browser";
import type { Request as ExampleRequest } from "@/examples/contracts";
import type { ExamplesResult } from "@/examples/model";

let firefoxHost: HTMLIFrameElement | undefined;
const hosts = new Set<Browser.runtime.Port>();
const readyListeners = new Set<() => void>();
const exampleQueries = new Map<
  string,
  { resolve: (value: ExamplesResult) => void; reject: (error: Error) => void }
>();
let exampleIdleTimer: ReturnType<typeof setTimeout> | undefined;

export function connectImportHost(port: Browser.runtime.Port) {
  if (port.name !== "import-host") return;
  if (port.sender?.url !== browser.runtime.getURL("/imports.html")) return;
  port.onMessage.addListener((message) => {
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
    if (!hosts.size)
      for (const pending of exampleQueries.values())
        pending.reject(new Error(t("background_host_failed")));
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

export function handleImports(action: "runImport" | "closeImportHost") {
  return navigator.locks.request("srs-reader-import-host", async () => {
    const task = await db.importTasks.get("current");
    const running = task?.status === "running";
    const needed =
      running || exampleQueries.size > 0 || exampleIdleTimer !== undefined;
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
        if (!contexts.length)
          await browser.offscreen.createDocument({
            url,
            reasons: ["WORKERS"],
            justification: t("background_work_reason"),
          });
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
