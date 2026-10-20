import { t } from "@/shared/i18n/i18n";

export function httpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(t("secure_url_required"));
  return url.href;
}
