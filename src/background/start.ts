import { requestSchema } from "@/background/contracts";
import { handle } from "@/background/handle";
import { t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";
import { udpipePermission } from "@/languages/udpipe-permission";
import { getSettings, saveSettings } from "@/settings/store";
import { notify } from "@/background/events";
import { srsWrite } from "@/platform/locks";
import { connectImportHost, handleImports } from "@/imports/commands";

export function startBackground() {
  browser.runtime.onConnect.addListener(connectImportHost);
  if (import.meta.env.BROWSER === "firefox") {
    browser.permissions.onRemoved.addListener(() => {
      void srsWrite(async () => {
        const settings = await getSettings();
        if (settings.udpipe && !(await udpipePermission())) {
          await saveSettings({ ...settings, udpipe: false });
          await notify(undefined, "settings");
        }
      }).catch(console.warn);
    });
  }
  const reads = new Set([
    "settings",
    "dictionaries",
    "scan",
    "detectLanguage",
    "lookup",
    "createSession",
  ]);

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const parsed = requestSchema.safeParse(message);
    if (!parsed.success) return undefined;
    const fromExtensionPage =
      sender.id === browser.runtime.id &&
      !!sender.url?.startsWith(browser.runtime.getURL("/"));
    if (!fromExtensionPage && !reads.has(parsed.data.action))
      return Promise.resolve({
        error: t("this_action_is_only_available_inside_srsreader"),
      });
    if (parsed.data.action === "closeLookup" && sender.tab?.id)
      void browser.tabs.sendMessage(sender.tab.id, { event: "closeLookup" });

    return handle(parsed.data).then(
      (value) => ({ value }),
      (error) => ({
        error: error instanceof Error ? error.message : String(error),
        code:
          error instanceof Error && "code" in error ? error.code : undefined,
      }),
    );
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install")
      void browser.windows.create({
        url: browser.runtime.getURL("/app.html") + "#setup",
        type: "popup",
        width: 760,
        height: 760,
      });
  });
  void handleImports("runImport").catch(console.error);
}
