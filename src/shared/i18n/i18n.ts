import en from "@/shared/i18n/locales/en.json";
import uk from "@/shared/i18n/locales/uk.json";
import i18next from "i18next";
import { z } from "zod";
import enErrors from "zod/v4/locales/en.js";
import ukErrors from "zod/v4/locales/uk.js";

export const interfaceLanguages = ["en", "uk"] as const;
export const i18n = i18next.createInstance();
void i18n.init({
  resources: { en: { translation: en }, uk: { translation: uk } },
  lng: navigator.language,
  fallbackLng: "en",
  supportedLngs: interfaceLanguages,
  load: "languageOnly",
  initAsync: false,
  interpolation: { escapeValue: false },
});
i18n.on("languageChanged", () =>
  z.config(i18n.resolvedLanguage === "uk" ? ukErrors() : enErrors()),
);
z.config(i18n.resolvedLanguage === "uk" ? ukErrors() : enErrors());
export const t = i18n.t.bind(i18n);
export function setInterfaceLanguage(
  language: string,
  nativeLanguage = navigator.language,
) {
  return i18n.changeLanguage(language === "auto" ? nativeLanguage : language);
}
export function number(value: number, options?: Intl.NumberFormatOptions) {
  return value.toLocaleString(i18n.resolvedLanguage, options);
}

export function downloadSize(bytes: number) {
  const [value, unit] =
    bytes < 1024
      ? [bytes, "byte"]
      : bytes < 1024 ** 2
        ? [bytes / 1024, "kilobyte"]
        : [bytes / 1024 ** 2, "megabyte"];
  return number(Number(value), {
    style: "unit",
    unit: String(unit),
    unitDisplay: "short",
    maximumFractionDigits: 2,
  });
}
