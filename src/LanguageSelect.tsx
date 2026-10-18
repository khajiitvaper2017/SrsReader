import { t, i18n } from "./i18n";
import { supportedLanguages, languageName } from "./languages";

export function LanguageSelect({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (language: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="" disabled>
        {t("choose_a_language")}{" "}
      </option>
      {[...supportedLanguages]
        .filter((language) => languageName(language) !== language)
        .sort((a, b) =>
          languageName(a).localeCompare(languageName(b), i18n.resolvedLanguage),
        )
        .map((language) => (
          <option key={language} value={language}>
            {languageName(language)}
          </option>
        ))}
    </select>
  );
}
