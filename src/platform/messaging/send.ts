import type { Request, Responses } from "@/background/contracts";
import { settingsSchema } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

export async function rpc<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  let response = await browser.runtime.sendMessage(request);
  while (response?.needsReplay) {
    window.dispatchEvent(
      new CustomEvent("srs-progress", {
        detail: { processed: 0, total: 0, ready: false },
      }),
    );
    try {
      let progress: Responses["prepareRwkv"];
      do {
        progress = await rpc({ action: "prepareRwkv" });
        window.dispatchEvent(
          new CustomEvent("srs-progress", { detail: progress }),
        );
      } while (!progress.ready);
    } catch (error) {
      window.dispatchEvent(new CustomEvent("srs-progress"));
      throw error;
    }
    response = await browser.runtime.sendMessage(request);
  }
  if (!response || response.error)
    throw new Error(
      response?.error || t("the_extension_could_not_respond_reload_this_page"),
    );
  if (request.action === "settings" || request.action === "setSettings")
    response.value = settingsSchema.parse(response.value);
  return response.value;
}

export async function changed() {
  await browser.runtime.sendMessage({ action: "invalidate" });
}
