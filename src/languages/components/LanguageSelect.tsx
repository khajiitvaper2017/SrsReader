import { Select } from "@mantine/core";
import {
  languageLabel,
  languageName,
  supportedLanguages,
} from "@/languages/codes";
import { i18n, t } from "@/shared/i18n/i18n";

export function LanguageSelect({
  value,
  label,
  description,
  onChange,
  disabled = false,
}: {
  value: string;
  label: string;
  description?: string;
  onChange: (language: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      searchable
      disabled={disabled}
      label={label}
      description={description}
      value={value || null}
      placeholder={t("choose_a_language")}
      nothingFoundMessage={t("settings_no_languages")}
      onChange={(value) => onChange(value!)}
      data={[...supportedLanguages]
        .filter((language) => languageName(language) !== language)
        .sort((a, b) =>
          languageName(a).localeCompare(languageName(b), i18n.resolvedLanguage),
        )
        .map((language) => ({
          value: language,
          label: languageLabel(language),
        }))}
    />
  );
}
