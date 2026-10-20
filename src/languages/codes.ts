import catalog from "@/languages/language-catalog.json";
import { i18n } from "@/shared/i18n/i18n";

const languages: Record<string, { iso3?: string; morphology?: string }> =
  catalog;
export const supportedLanguages = [
  ...new Set(Object.keys(languages).map(languageCode)),
];

export function languageCode(code: string) {
  return new Intl.Locale(code).language;
}
export function languageIso3(code: string) {
  return languages[languageCode(code)]?.iso3;
}
export function morphologyLanguage(code: string) {
  return code ? languages[languageCode(code)]?.morphology : undefined;
}
export function languageName(code: string) {
  return (
    new Intl.DisplayNames([i18n.resolvedLanguage || "en"], {
      type: "language",
    }).of(code) || code
  );
}
export function systemLanguage() {
  return languageCode(navigator.language);
}
