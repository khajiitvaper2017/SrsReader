import {
  CheckIcon,
  Group,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { onlineDictionaries } from "@/dictionaries/online";
import {
  icuLanguage,
  languageIso3,
  languageFlag,
  languageLabel,
  languageName,
  morphologyLanguage,
  supportedLanguages,
  systemLanguage,
  udpipeModel,
} from "@/languages/codes";
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
      label: languageLabel(language),
      features: [
        udpipeModel(language) && t("language_feature_grammar"),
        morphologyLanguage(language) && t("language_feature_word_forms"),
        onlineDictionaries.some(
          (dictionary) => dictionary.language === language,
        ) && t("language_feature_online_dictionary"),
        languageIso3(language) && t("language_feature_examples"),
        icuLanguage(language) && t("language_feature_icu"),
      ].filter(Boolean),
    }))
    .sort(
      (a, b) =>
        b.features.length - a.features.length ||
        languageName(a.value).localeCompare(
          languageName(b.value),
          i18n.resolvedLanguage,
        ),
    );

  return (
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
        <MultiSelect
          label={t("native_languages")}
          description={[
            t("native_languages_help"),
            setup &&
              t("detected_language", {
                language: languageName(systemLanguage()),
              }),
          ]
            .filter(Boolean)
            .join(" ")}
          searchable
          required
          withPillsReorder
          data={[...supportedLanguages]
            .filter((language) => languageName(language) !== language)
            .sort((a, b) =>
              languageName(a).localeCompare(
                languageName(b),
                i18n.resolvedLanguage,
              ),
            )
            .map((language) => ({
              value: language,
              label: languageLabel(language),
            }))}
          nothingFoundMessage={t("settings_no_languages")}
          value={settings.nativeLanguages}
          onChange={(nativeLanguages) => {
            if (nativeLanguages.length) void update({ nativeLanguages });
          }}
        />
        <Select
          label={t("interface_language_setting")}
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
              label: `${languageFlag(language)} ${new Intl.DisplayNames(
                [language],
                {
                  type: "language",
                },
              ).of(language)!}`,
            })),
          ]}
        />
      </SimpleGrid>
    </Stack>
  );
}
