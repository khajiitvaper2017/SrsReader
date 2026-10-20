import { defaults, settingsSchema, type Settings } from "@/settings/model";
import { db } from "@/shared/db";
import { setInterfaceLanguage } from "@/shared/i18n/i18n";

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
