import { requestSchema } from "@/background/contracts";
import { handle } from "@/background/handle";
import { t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

export function startBackground() {
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
    if (parsed.data.action === "resizeLookup" && sender.tab?.id)
      void browser.tabs.sendMessage(sender.tab.id, {
        event: "resizeLookup",
        session: parsed.data.session,
        height: parsed.data.height,
      });

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
}
