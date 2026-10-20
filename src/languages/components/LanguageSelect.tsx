import { languageName, supportedLanguages } from "@/languages/codes";
import { i18n, t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";

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
    <Select
      aria-label={label}
      value={value}
      onValueChange={(value) => onChange(value)}
    >
      <SelectOption value="" disabled>
        {t("choose_a_language")}{" "}
      </SelectOption>
      {[...supportedLanguages]
        .filter((language) => languageName(language) !== language)
        .sort((a, b) =>
          languageName(a).localeCompare(languageName(b), i18n.resolvedLanguage),
        )
        .map((language) => (
          <SelectOption key={language} value={language}>
            {languageName(language)}
          </SelectOption>
        ))}
    </Select>
  );
}
