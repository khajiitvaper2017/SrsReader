import { notify } from "@/background/events";
import { srsWrite } from "@/platform/locks";
import type { Request } from "@/settings/contracts";
import { settingsSchema, type Settings } from "@/settings/model";
import { getSettings, saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";

export function handleSettings(request: Request, settings: Settings) {
  return request.action === "setSettings"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "settings":
      return settings;
    case "setSettings": {
      const next = settingsSchema.parse({ ...settings, ...request.value });
      if (
        next.algorithm === "rwkv" &&
        settings.algorithm !== "rwkv" &&
        !(await rwkvStatus(next)).ready
      )
        throw new Error(t("rwkv_not_ready"));
      await saveSettings(next);
      await notify(undefined, "settings");
      return next;
    }
  }
}
