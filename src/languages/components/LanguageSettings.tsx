import { Group, NativeSelect, Paper, Stack, Text, Title } from "@mantine/core";
import { languageName, systemLanguage } from "@/languages/codes";
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
    <Paper mb="md">
      <Stack gap="md">
        <Title order={2}>{t("languages")}</Title>
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <strong style={{ flex: 1, minWidth: 0 }}>
            {t("study_language")}
          </strong>
          <LanguageSelect
            label={t("study_language")}
            value={settings.studyLanguage}
            onChange={(studyLanguage) =>
              void update({ studyLanguage, voice: "" })
            }
            aria-label={t("study_language")}
            w={160}
            maw="50%"
          />
        </Group>
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("native_language")}</strong>
            {setup && (
              <Text component="small" size="xs" c="dimmed" display="block">
                {t("detected_language", {
                  language: languageName(systemLanguage()),
                })}
              </Text>
            )}
          </span>
          <LanguageSelect
            label={t("native_language")}
            value={settings.nativeLanguage}
            onChange={(nativeLanguage) => void update({ nativeLanguage })}
            aria-label={t("native_language")}
            w={160}
            maw="50%"
          />
        </Group>
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <strong style={{ flex: 1, minWidth: 0 }}>
            {t("interface_language_setting")}
          </strong>
          <NativeSelect
            aria-label={t("interface_language_setting")}
            value={settings.interfaceLanguage}
            onChange={(event) => {
              const value = event.currentTarget.value;
              return void update({
                interfaceLanguage: value as Settings["interfaceLanguage"],
              });
            }}
            w={160}
            maw="50%"
          >
            <option value="auto">{t("same_as_native_language")}</option>
            {interfaceLanguages.map((language) => (
              <option key={language} value={language}>
                {new Intl.DisplayNames([language], { type: "language" }).of(
                  language,
                )}
              </option>
            ))}
          </NativeSelect>
        </Group>
        <Stack gap="xs" c="dimmed" fz="xs">
          {t("read_and_collect_words_in_your_study_language")}{" "}
          {t("interface_language", {
            language: languageName(i18n.resolvedLanguage || "en"),
          })}
        </Stack>
      </Stack>
    </Paper>
  );
}
