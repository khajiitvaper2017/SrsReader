import { rpc } from "@/platform/messaging/send";
import type { Request, Responses } from "@/settings/contracts";
import { settingsSchema, uiSettingsCacheKey } from "@/settings/model";
import { setInterfaceLanguage } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

export async function settingsClient<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  return settingsSchema.parse(await rpc(request));
}

export async function getUISettings() {
  let cached: unknown;
  try {
    cached = (await browser.storage.session.get(uiSettingsCacheKey))[
      uiSettingsCacheKey
    ];
  } catch (error) {
    console.warn(error);
  }
  const parsed = settingsSchema.safeParse(cached);
  const settings = parsed.success
    ? parsed.data
    : await settingsClient({ action: "settings" });
  await setInterfaceLanguage(
    settings.interfaceLanguage,
    settings.nativeLanguage,
  );
  return settings;
}
