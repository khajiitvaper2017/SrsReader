import { db } from "@/platform/database/db";
import {
  defaults,
  settingsSchema,
  uiSettingsCacheKey,
  type Settings,
} from "@/settings/model";
import { setInterfaceLanguage } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

export async function getSettings(): Promise<Settings> {
  const settings = settingsSchema.parse(
    (await db.settings.get("main"))?.value || defaults,
  );
  await setInterfaceLanguage(
    settings.interfaceLanguage,
    settings.nativeLanguage,
  );
  return settings;
}

export function refreshUISettings() {
  return navigator.locks.request("srs-reader-ui-settings", async () => {
    try {
      const settings = await getSettings();
      await browser.storage.session.set({ [uiSettingsCacheKey]: settings });
      return settings;
    } catch (error) {
      await browser.storage.session
        .remove(uiSettingsCacheKey)
        .catch(console.warn);
      throw error;
    }
  });
}

export const saveSettings = ({
  studyLanguage: _language,
  nativeLanguage: _nativeLanguage,
  ...value
}: Omit<Settings, "studyLanguage" | "nativeLanguage"> & {
  studyLanguage?: string;
  nativeLanguage?: string;
}) => db.settings.put({ id: "main", value });
