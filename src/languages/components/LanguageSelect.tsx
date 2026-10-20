import { NativeSelect } from "@mantine/core";
import { languageName, supportedLanguages } from "@/languages/codes";
import { i18n, t } from "@/shared/i18n/i18n";
export function LanguageSelect({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (language: string) => void;
  w?: number;
  maw?: string;
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => {
        const value = event.currentTarget.value;
        return onChange(value);
      }}
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
    </NativeSelect>
  );
}
