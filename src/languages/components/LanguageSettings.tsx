import {
  Paper,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Title,
} from "@mantine/core";
import {
  languageName,
  supportedLanguages,
  systemLanguage,
} from "@/languages/codes";
import { LanguageSelect } from "@/languages/components/LanguageSelect";
import type { Settings } from "@/settings/model";
import { i18n, interfaceLanguages, t } from "@/shared/i18n/i18n";

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
    <Paper>
      <Stack>
        <Title order={2}>{t("languages")}</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          <MultiSelect
            label={t("studied_languages")}
            description={t("studied_languages_help")}
            searchable
            value={settings.studyLanguages}
            data={supportedLanguages
              .map((language) => ({
                value: language,
                label: languageName(language),
              }))
              .sort((a, b) =>
                a.label.localeCompare(b.label, i18n.resolvedLanguage),
              )}
            nothingFoundMessage={t("settings_no_languages")}
            onChange={(studyLanguages) => void update({ studyLanguages })}
          />
          <LanguageSelect
            label={t("native_language")}
            description={
              setup
                ? t("detected_language", {
                    language: languageName(systemLanguage()),
                  })
                : undefined
            }
            value={settings.nativeLanguage}
            onChange={(nativeLanguage) => void update({ nativeLanguage })}
          />
          <Select
            label={t("interface_language_setting")}
            description={t("interface_language", {
              language: languageName(i18n.resolvedLanguage || "en"),
            })}
            value={settings.interfaceLanguage}
            onChange={(value) =>
              void update({
                interfaceLanguage: value as Settings["interfaceLanguage"],
              })
            }
            data={[
              { value: "auto", label: t("same_as_native_language") },
              ...interfaceLanguages.map((language) => ({
                value: language,
                label: new Intl.DisplayNames([language], {
                  type: "language",
                }).of(language)!,
              })),
            ]}
          />
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
