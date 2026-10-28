import { db } from "@/platform/database/db";
import { defaults, settingsSchema, type Settings } from "@/settings/model";
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

export const saveSettings = ({
  studyLanguage: _language,
  nativeLanguage: _nativeLanguage,
  ...value
}: Omit<Settings, "studyLanguage" | "nativeLanguage"> & {
  studyLanguage?: string;
  nativeLanguage?: string;
}) => db.settings.put({ id: "main", value });
