import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { browser, type Browser } from "wxt/browser";

let firefoxHost: HTMLIFrameElement | undefined;
const firefoxPorts = new Set<Browser.runtime.Port>();

export function connectImportHost(port: Browser.runtime.Port) {
  if (port.name !== "import-host") return;
  // Firefox event pages stay loaded while the import document has an open port.
  firefoxPorts.add(port);
  port.onDisconnect.addListener(() => firefoxPorts.delete(port));
}

export function handleImports(action: "runImport" | "closeImportHost") {
  return navigator.locks.request("srs-reader-import-host", async () => {
    const running = (await db.importTasks.get("current"))?.status === "running";
    if (action === "closeImportHost" && running) return;
    const url = browser.runtime.getURL("/imports.html");
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
    await browser.runtime.sendMessage({ target: "import-host" });
  });
}
