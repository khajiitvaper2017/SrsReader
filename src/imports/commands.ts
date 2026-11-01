import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { browser, type Browser } from "wxt/browser";

let firefoxHost: HTMLIFrameElement | undefined;
const hosts = new Set<Browser.runtime.Port>();
const readyListeners = new Set<() => void>();

export function connectImportHost(port: Browser.runtime.Port) {
  if (port.name !== "import-host") return;
  if (port.sender?.url !== browser.runtime.getURL("/imports.html")) return;
  port.onMessage.addListener((message) => {
    if (message?.type !== "ready") return;
    hosts.add(port);
    for (const ready of readyListeners) ready();
  });
  port.onDisconnect.addListener(() => hosts.delete(port));
}

export function handleImports(action: "runImport" | "closeImportHost") {
  return navigator.locks.request("srs-reader-import-host", async () => {
    const task = await db.importTasks.get("current");
    const running = task?.status === "running";
    if (action === "closeImportHost" && running) return;
    const url = browser.runtime.getURL("/imports.html");
    try {
      if (import.meta.env.BROWSER === "firefox") {
        if (!running) {
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
            frame.onerror = () => reject(new Error(t("import_host_failed")));
            document.body.append(frame);
          });
        }
      } else {
        const contexts = await browser.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
          documentUrls: [url],
        });
        if (!running) {
          if (contexts.length) await browser.offscreen.closeDocument();
          return;
        }
        if (!contexts.length)
          await browser.offscreen.createDocument({
            url,
            reasons: ["WORKERS"],
            justification: t("import_background_reason"),
          });
      }
      if (!hosts.size) {
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
            reject(new Error(t("import_host_failed")));
          }, 10000);
          readyListeners.add(ready);
          if (hosts.size) ready();
        });
      }
      hosts.values().next().value!.postMessage({ type: "run" });
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
