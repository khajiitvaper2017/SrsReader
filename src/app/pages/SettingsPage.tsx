import {
  Alert,
  Anchor,
  Button,
  Group,
  Paper,
  Tabs,
  Text,
  Stack,
  Title,
} from "@mantine/core";
import { AudioSettings } from "@/audio/components/AudioSettings";
import { BackupSettings } from "@/backups/components/BackupSettings";
import { dictionariesClient } from "@/dictionaries/client";
import { DictionarySettings } from "@/dictionaries/components/DictionarySettings";
import type { Dictionary } from "@/dictionaries/model";
import { examplesClient } from "@/examples/client";
import { languageIso3, morphologyLanguage } from "@/languages/codes";
import { LanguageDataSettings } from "@/languages/components/LanguageDataSettings";
import { LanguageSettings } from "@/languages/components/LanguageSettings";
import { useLanguageData } from "@/languages/hooks/useLanguageData";
import { installedMorphology } from "@/languages/storage";
import { LookupSettings } from "@/reader/components/LookupSettings";
import { ReadingSettings } from "@/reader/components/ReadingSettings";
import { settingsClient } from "@/settings/client";
import { useSettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { ReviewSettings } from "@/srs/components/ReviewSettings";
import {
  BookOpen,
  Check,
  Database,
  Languages,
  MousePointer2,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { WordColors } from "@/settings/components/WordColors";
import { AppearanceSettings } from "@/settings/components/AppearanceSettings";
import { TaskProgress } from "@/shared/ui/TaskProgress";
import { useCallback, useEffect, useState } from "react";
export function SettingsPage({
  settings,
  setSettings,
  setup = false,
  tab = "general",
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  setup?: boolean;
  tab?: string;
}) {
  const tasks = useSettingsTask();
  const { error, setError, notice, busy, setBusy, progress, setProgress } =
    tasks;
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const languageData = useLanguageData(settings.studyLanguage, tasks);
  const load = useCallback(() => {
    void dictionariesClient({ action: "dictionaries" })
      .then(setDictionaries)
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
  useChanges(load, ["dictionaries"]);
  async function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      setSettings(await settingsClient({ action: "setSettings", value: next }));
      setError("");
    } catch (error) {
      setSettings(settings);
      setError((error as Error).message);
    }
  }
  async function finishSetup() {
    setBusy(true);
    setError("");
    try {
      if (
        morphologyLanguage(settings.studyLanguage) &&
        !(await installedMorphology(settings.studyLanguage))
      )
        await languageData.install("morphology");
      if (
        languageIso3(settings.studyLanguage) &&
        !(await examplesClient({ action: "exampleCorpus" })).installed
      )
        await languageData.install("examples");
      setSettings(
        await settingsClient({
          action: "setSettings",
          value: { ...settings, setupComplete: true },
        }),
      );
      location.hash = "review";
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }
  const sections = [
    {
      value: "general",
      label: t("settings_general"),
      icon: <SlidersHorizontal size={16} />,
    },
    {
      value: "reading",
      label: t("settings_reading"),
      icon: <MousePointer2 size={16} />,
    },
    {
      value: "dictionaries",
      label: t("dictionaries"),
      icon: <BookOpen size={16} />,
    },
    { value: "review", label: t("review"), icon: <Check size={16} /> },
    {
      value: "audio",
      label: t("settings_audio_translation"),
      icon: <Volume2 size={16} />,
    },
    {
      value: "backups",
      label: t("settings_backups"),
      icon: <Database size={16} />,
    },
  ];
  const selected = sections.some((section) => section.value === tab)
    ? tab
    : "general";
  const dictionarySettings = (
    <DictionarySettings
      settings={settings}
      dictionaries={dictionaries}
      onChange={update}
      reload={load}
      tasks={tasks}
    />
  );
  const dataSettings = (
    <LanguageDataSettings
      settings={settings}
      data={languageData}
      tasks={tasks}
    />
  );
  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={1}>{t(setup ? "setup" : "settings")}</Title>
        {setup && <Text c="dimmed">{t("settings_setup_intro")}</Text>}
      </Stack>
      <ErrorBox error={error} />
      {notice && (
        <Alert color="green" role="status">
          {notice}
        </Alert>
      )}
      {busy && progress && (
        <Paper>
          <TaskProgress progress={progress} />
        </Paper>
      )}
      {setup ? (
        <>
          <LanguageSettings settings={settings} onChange={update} setup />
          {dictionarySettings}
          <LookupSettings settings={settings} onChange={update} />
          {dataSettings}
          <Group justify="flex-end">
            <Button
              variant="filled"
              loading={busy}
              leftSection={<Check size={16} />}
              disabled={
                !settings.lookupBindings.length ||
                !dictionaries.some(
                  (dictionary) =>
                    dictionary.enabled &&
                    dictionary.language === settings.studyLanguage &&
                    dictionary.count > 0,
                )
              }
              onClick={() => void finishSetup()}
            >
              {t("finish_setup")}
            </Button>
          </Group>
        </>
      ) : (
        <Tabs
          value={selected}
          onChange={(value) => {
            location.hash = `settings/${value}`;
          }}
          keepMountedMode="display-none"
        >
          <Tabs.List mb="md" aria-label={t("settings_sections")}>
            {sections.map((section) => (
              <Tabs.Tab
                data-srs-reader
                key={section.value}
                value={section.value}
                leftSection={section.icon}
              >
                {section.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="general">
            <Stack gap="md">
              <LanguageSettings settings={settings} onChange={update} />
              <AppearanceSettings settings={settings} onChange={update} />
              <Paper>
                <Group justify="space-between" gap="sm">
                  <Group gap="xs">
                    <Languages size={18} />
                    <Text>{t("settings_setup_help")}</Text>
                  </Group>
                  <Button component="a" href="#setup">
                    {t("open_setup")}
                  </Button>
                </Group>
              </Paper>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="reading">
            <Stack gap="md">
              <ReadingSettings
                settings={settings}
                onChange={update}
                dictionaries={dictionaries}
              />
              <LookupSettings settings={settings} onChange={update} />
              <WordColors settings={settings} onChange={update} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="dictionaries">
            <Stack gap="md">
              {dictionarySettings}
              {dataSettings}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="review">
            <ReviewSettings
              settings={settings}
              onChange={update}
              dictionaries={dictionaries}
              onError={setError}
            />
          </Tabs.Panel>
          <Tabs.Panel value="audio">
            <Stack gap="md">
              <AudioSettings settings={settings} onChange={update} />
              <Paper>
                <Stack gap="sm">
                  <Title order={2}>{t("translation")}</Title>
                  <Text c="dimmed">
                    {t("translation_stays_on_your_device_models_download_on")}
                  </Text>
                  <Anchor href="#docs/reading">{t("docs_reading")}</Anchor>
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="backups">
            <BackupSettings setSettings={setSettings} tasks={tasks} />
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
