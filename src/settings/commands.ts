import { notify } from "@/background/events";
import { srsWrite } from "@/platform/locks";
import type { Request } from "@/settings/contracts";
import type { Settings } from "@/settings/model";
import { getSettings, saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { rwkvStatus } from "@/srs/rwkv/runtime";

export function handleSettings(request: Request, settings: Settings) {
  return request.action === "setSettings"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "settings":
      return settings;
    case "setSettings":
      if (
        request.value.algorithm === "rwkv" &&
        settings.algorithm !== "rwkv" &&
        !(await rwkvStatus(request.value)).ready
      )
        throw new Error(t("rwkv_not_ready"));
      await saveSettings(request.value);
      await notify();
      return request.value;
  }
}
