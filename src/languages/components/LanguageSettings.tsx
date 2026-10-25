import {
  CheckIcon,
  Group,
  Paper,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { onlineDictionaries } from "@/dictionaries/online";
import {
  languageIso3,
  languageName,
  morphologyLanguage,
  supportedLanguages,
  systemLanguage,
  udpipeModel,
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
  const languages = supportedLanguages
    .map((language) => ({
      value: language,
      label: languageName(language),
      features: [
        udpipeModel(language) && t("language_feature_grammar"),
        morphologyLanguage(language) && t("language_feature_word_forms"),
        onlineDictionaries.some(
          (dictionary) => dictionary.language === language,
        ) && t("language_feature_online_dictionary"),
        languageIso3(language) && t("language_feature_examples"),
      ].filter(Boolean),
    }))
    .sort(
      (a, b) =>
        b.features.length - a.features.length ||
        a.label.localeCompare(b.label, i18n.resolvedLanguage),
    );

  return (
    <Paper>
      <Stack>
        <Title order={2}>{t("languages")}</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          <MultiSelect
            label={t("studied_languages")}
            searchable
            value={settings.studyLanguages}
            data={languages}
            renderOption={({ option, checked }) => {
              const { features } = languages.find(
                (language) => language.value === option.value,
              )!;
              return (
                <Group gap="sm" wrap="nowrap" flex={1} miw={0}>
                  {checked && <CheckIcon size={12} aria-hidden="true" />}
                  <Stack gap={0} flex={1} miw={0}>
                    <Text>{option.label}</Text>
                    {features.length > 0 && (
                      <Text variant="supporting">{features.join(" · ")}</Text>
                    )}
                  </Stack>
                </Group>
              );
            }}
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
