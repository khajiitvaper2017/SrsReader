import { languageName, systemLanguage } from "@/languages/codes";
import { LanguageSelect } from "@/languages/components/LanguageSelect";
import type { Settings } from "@/settings/model";
import { i18n, interfaceLanguages, t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";

export function LanguageSettings({
  settings,
  onChange: update,
  setup = false,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  setup?: boolean;
}) {
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{t("languages")}</h2>
      </div>
      <label className="setting-row">
        <strong>{t("study_language")}</strong>
        <LanguageSelect
          label={t("study_language")}
          value={settings.studyLanguage}
          onChange={(studyLanguage) =>
            void update({ studyLanguage, voice: "" })
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("native_language")}</strong>
          {setup && (
            <small>
              {t("detected_language", {
                language: languageName(systemLanguage()),
              })}
            </small>
          )}
        </span>
        <LanguageSelect
          label={t("native_language")}
          value={settings.nativeLanguage}
          onChange={(nativeLanguage) => void update({ nativeLanguage })}
        />
      </label>
      <label className="setting-row">
        <strong>{t("interface_language_setting")}</strong>
        <Select
          aria-label={t("interface_language_setting")}
          value={settings.interfaceLanguage}
          onValueChange={(value) =>
            void update({
              interfaceLanguage: value as Settings["interfaceLanguage"],
            })
          }
        >
          <SelectOption value="auto">
            {t("same_as_native_language")}
          </SelectOption>
          {interfaceLanguages.map((language) => (
            <SelectOption key={language} value={language}>
              {new Intl.DisplayNames([language], { type: "language" }).of(
                language,
              )}
            </SelectOption>
          ))}
        </Select>
      </label>
      <div className="setting-footnote">
        {t("read_and_collect_words_in_your_study_language")}{" "}
        {t("interface_language", {
          language: languageName(i18n.resolvedLanguage || "en"),
        })}
      </div>
    </section>
  );
}
