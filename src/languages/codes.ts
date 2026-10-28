import catalog from "@/languages/language-catalog.json";
import { i18n } from "@/shared/i18n/i18n";

const languages: Record<
  string,
  {
    iso3?: string;
    morphology?: string;
    udpipe?: string;
    udpipeAlternative?: string;
  }
> = catalog;
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
export function udpipeModels(code: string) {
  const language = code ? languages[languageCode(code)] : undefined;
  return [language?.udpipe, language?.udpipeAlternative].filter(
    (model) => model !== undefined,
  );
}
export function udpipeModel(code: string, selected?: string) {
  const models = udpipeModels(code);
  return models.find((model) => model === selected) ?? models[0];
}
export function languageName(code: string) {
  return i18n.t(`language_name_${code}`, {
    defaultValue:
      new Intl.DisplayNames([i18n.resolvedLanguage || "en"], {
        type: "language",
      }).of(code) || code,
  });
}
export function languageFlag(code: string) {
  const region = new Intl.Locale(code).maximize().region;
  return region && /^[A-Z]{2}$/.test(region)
    ? String.fromCodePoint(
        ...[...region].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
      )
    : "🌐";
}
export function languageLabel(code: string) {
  return `${languageFlag(code)} ${languageName(code)}`;
}
export function systemLanguage() {
  return languageCode(navigator.language);
}
