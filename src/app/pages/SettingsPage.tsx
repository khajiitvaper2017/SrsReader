import {
  Anchor,
  Button,
  Group,
  Paper,
  SimpleGrid,
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
import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
export function SettingsPage({
  settings,
  setSettings,
  setup = false,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  setup?: boolean;
}) {
  const tasks = useSettingsTask();
  const { error, setError, notice, busy, setBusy, setProgress } = tasks;
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
  return (
    <>
      {setup && <Title order={1}>{t("setup")}</Title>}
      <LanguageSettings settings={settings} onChange={update} setup={setup} />
      <ErrorBox error={error} />
      {notice && (
        <Stack role="status" gap="xs">
          {notice}
        </Stack>
      )}
      <LanguageDataSettings
        settings={settings}
        data={languageData}
        tasks={tasks}
      />

      <DictionarySettings
        settings={settings}
        dictionaries={dictionaries}
        onChange={update}
        reload={load}
        tasks={tasks}
      />
      <LookupSettings settings={settings} onChange={update} />
      {setup ? (
        <Group gap="xs" align="center" justify="space-between">
          <Button
            disabled={
              busy ||
              !settings.lookupBindings.length ||
              !dictionaries.some(
                (dictionary) =>
                  dictionary.enabled &&
                  dictionary.language === settings.studyLanguage &&
                  dictionary.count > 0,
              )
            }
            onClick={() => void finishSetup()}
            variant="filled"
          >
            <Check aria-hidden="true" size={16} /> {t("finish_setup")}{" "}
          </Button>
        </Group>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <ReadingSettings
              settings={settings}
              onChange={update}
              dictionaries={dictionaries}
            />
            <ReviewSettings
              settings={settings}
              onChange={update}
              dictionaries={dictionaries}
              onError={setError}
            />
          </SimpleGrid>
          <Paper mb="md">
            <Stack gap="md">
              <Title order={2}>{t("translation")}</Title>
              <Stack gap="xs" c="dimmed" fz="xs">
                {t("translation_stays_on_your_device_models_download_on")}{" "}
              </Stack>
            </Stack>
          </Paper>
          <AudioSettings settings={settings} onChange={update} />
          <BackupSettings setSettings={setSettings} tasks={tasks} />
          <Anchor href="#setup">{t("open_setup")} </Anchor>
        </>
      )}
    </>
  );
}
