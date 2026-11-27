import type { DictionaryRole } from "@/dictionaries/display";
import { isOnlineDictionary } from "@/dictionaries/online";
import { Box, Button, Group, Select, Switch, Text, Stack } from "@mantine/core";
import { AudioSettings } from "@/audio/components/AudioSettings";
import { audioClient } from "@/audio/client";
import { BackupSettings } from "@/backups/components/BackupSettings";
import { dictionariesClient } from "@/dictionaries/client";
import { DictionarySettings } from "@/dictionaries/components/DictionarySettings";
import type { Dictionary } from "@/dictionaries/model";
import { languageLabel } from "@/languages/codes";
import { LanguageDataSettings } from "@/languages/components/LanguageDataSettings";
import { LanguageSettings } from "@/languages/components/LanguageSettings";
import { useLanguageData } from "@/languages/hooks/useLanguageData";
import { LookupSettings } from "@/reader/components/LookupSettings";
import { ReadingSettings } from "@/reader/components/ReadingSettings";
import { settingsClient } from "@/settings/client";
import type { useSettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { SyncSettings } from "@/sync/components/SyncSettings";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { ReviewSettings } from "@/srs/components/ReviewSettings";
import { ReviewControls } from "@/srs/components/ReviewControls";
import { Check } from "lucide-react";
import { PageHeader } from "@/shared/ui/PageHeader";
import { settingsSections } from "@/settings/navigation";
import { WordColors } from "@/settings/components/WordColors";
import { AppearanceSettings } from "@/settings/components/AppearanceSettings";
import {
  Activity,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
export function SettingsPage({
  settings: preferences,
  setSettings,
  tasks,
  setup = false,
  tab = "general",
  language = preferences.studyLanguage,
  dictionaryTab = "vocabulary",
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  tasks: ReturnType<typeof useSettingsTask>;
  setup?: boolean;
  tab?: string;
  language?: string;
  dictionaryTab?: string;
}) {
  const sections = settingsSections;
  const selected = sections.some((section) => section.value === tab)
    ? tab
    : "general";
  const needsLanguageData = setup || selected === "dictionaries";
  const needsDictionaries =
    needsLanguageData || selected === "reading" || selected === "review";
  const [visitedSections, setVisitedSections] = useState<string[]>([]);
  useEffect(() => {
    if (!setup)
      setVisitedSections((visited) =>
        visited.includes(selected) ? visited : [...visited, selected],
      );
  }, [setup, selected]);
  const [loadedDictionaries, setDictionaries] = useState<Dictionary[]>();
  const dictionaries = loadedDictionaries ?? [];
  const languages = [
    ...new Set([
      ...preferences.studyLanguages,
      ...(needsLanguageData
        ? dictionaries
            .filter((dictionary) => !isOnlineDictionary(dictionary.id))
            .map((dictionary) => dictionary.language)
        : []),
    ]),
  ];
  const selectedLanguage = languages.includes(language)
    ? language
    : languages[0] || "";
  const settings = useMemo(
    () => ({ ...preferences, studyLanguage: selectedLanguage }),
    [preferences, selectedLanguage],
  );
  const { setError, busy, setBusy } = tasks;
  const languageData = useLanguageData(
    needsLanguageData ? settings.studyLanguage : "",
    tasks,
  );
  const load = useCallback(() => {
    void dictionariesClient({ action: "dictionaries" })
      .then(setDictionaries)
      .catch((error) => setError(error.message));
  }, [setError]);
  useEffect(() => {
    if (needsDictionaries && !loadedDictionaries) load();
  }, [needsDictionaries, loadedDictionaries, load]);
  const dictionariesChanged = useCallback(() => {
    if (needsDictionaries) load();
    else setDictionaries(undefined);
  }, [needsDictionaries, load]);
  useChanges(dictionariesChanged, ["dictionaries", "settings"]);
  async function update(patch: Partial<Settings>) {
    const next = { ...preferences, ...patch };
    setSettings(next);
    try {
      setSettings(
        patch.audioSources
          ? await audioClient({
              action: "setAudioSources",
              sources: patch.audioSources,
            })
          : await settingsClient({ action: "setSettings", value: patch }),
      );
      setError("");
    } catch (error) {
      setSettings(preferences);
      setError((error as Error).message);
    }
  }
  async function finishSetup() {
    setBusy(true);
    setError("");
    try {
      setSettings(
        await settingsClient({
          action: "setSettings",
          value: { setupComplete: true },
        }),
      );
      location.hash = "review";
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const dictionaryRole: DictionaryRole =
    dictionaryTab === "frequency" ? "frequency" : "vocabulary";
  function navigate(
    section: string,
    chosenLanguage = language,
    role = dictionaryRole,
  ) {
    const params = new URLSearchParams({
      language: chosenLanguage,
      dictionary: role,
    });
    location.hash = `${setup ? "setup" : `settings/${section}`}?${params}`;
  }
  function withLanguagePicker(content: ReactNode) {
    if (!selectedLanguage) return null;
    return (
      <Stack>
        {languages.length > 1 && (
          <Select
            aria-label={t("language_settings_for")}
            value={selectedLanguage}
            disabled={busy}
            allowDeselect={false}
            data={languages.map((value) => ({
              value,
              label: languageLabel(value),
            }))}
            onChange={(value) => {
              if (value) navigate(selected, value);
            }}
          />
        )}
        {content}
      </Stack>
    );
  }
  function panel(section: string, content: ReactNode) {
    const active = selected === section;
    if (!active && !visitedSections.includes(section)) return null;
    return (
      <Activity key={section} mode={active ? "visible" : "hidden"}>
        {content}
      </Activity>
    );
  }
  const dictionarySettings = loadedDictionaries && (
    <DictionarySettings
      settings={settings}
      dictionaries={dictionaries}
      reload={load}
      tasks={tasks}
      role={dictionaryRole}
      withTitle={setup}
      onRoleChange={(role) => navigate(selected, selectedLanguage, role)}
    >
      <LanguageDataSettings
        settings={settings}
        data={languageData}
        tasks={tasks}
      />
    </DictionarySettings>
  );
  const content = setup ? (
    <>
      <LanguageSettings settings={settings} onChange={update} setup />
      {withLanguagePicker(
        <Stack>
          {loadedDictionaries && (
            <ReadingSettings
              settings={settings}
              onChange={update}
              dictionaries={dictionaries}
            />
          )}
          {dictionarySettings}
          <LookupSettings settings={settings} onChange={update} />
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
                    settings.studyLanguages.includes(dictionary.language) &&
                    dictionary.count > 0,
                )
              }
              onClick={() => void finishSetup()}
            >
              {t("finish_setup")}
            </Button>
          </Group>
        </Stack>,
      )}
    </>
  ) : (
    <>
      {panel(
        "general",
        <Stack>
          <LanguageSettings settings={settings} onChange={update} />
          <AppearanceSettings settings={settings} onChange={update} />
          <Group>
            <Button component="a" href="#setup" variant="subtle">
              {t("open_setup")}
            </Button>
          </Group>
        </Stack>,
      )}
      {panel(
        "reading",
        withLanguagePicker(
          <Stack>
            {loadedDictionaries && (
              <ReadingSettings
                settings={settings}
                onChange={update}
                dictionaries={dictionaries}
              />
            )}
            <WordColors settings={settings} onChange={update} />
          </Stack>,
        ),
      )}
      {panel(
        "dictionaries",
        withLanguagePicker(<Stack>{dictionarySettings}</Stack>),
      )}
      {panel(
        "review",
        withLanguagePicker(
          loadedDictionaries && (
            <ReviewSettings
              settings={settings}
              onChange={update}
              dictionaries={dictionaries}
              onError={setError}
            />
          ),
        ),
      )}
      {panel(
        "controls",
        <Stack>
          <LookupSettings settings={settings} onChange={update} />
          <ReviewControls settings={settings} onChange={update} />
        </Stack>,
      )}
      {panel(
        "audio",
        withLanguagePicker(
          <AudioSettings settings={settings} onChange={update} />,
        ),
      )}
      {panel(
        "translation",
        <Stack>
          <Switch
            labelPosition="left"
            w="100%"
            styles={{
              body: { width: "100%", minHeight: 44, alignItems: "center" },
              labelWrapper: { flex: 1 },
              track: { flexShrink: 0 },
            }}
            label={t("auto_translate_sentences")}
            checked={settings.autoTranslateSentences}
            onChange={(event) =>
              void update({
                autoTranslateSentences: event.currentTarget.checked,
              })
            }
          />
          <Switch
            labelPosition="left"
            w="100%"
            styles={{
              body: { width: "100%", minHeight: 44, alignItems: "center" },
              labelWrapper: { flex: 1 },
              track: { flexShrink: 0 },
            }}
            label={t("auto_translate_definitions")}
            checked={settings.autoTranslateDefinitions}
            onChange={(event) =>
              void update({
                autoTranslateDefinitions: event.currentTarget.checked,
              })
            }
          />
          <Text variant="supporting">
            {t("translation_stays_on_your_device_models_download_on")}
          </Text>
        </Stack>,
      )}
      {(selected === "sync" || visitedSections.includes("sync")) && (
        <Box hidden={selected !== "sync"}>
          <SyncSettings />
        </Box>
      )}
      {panel(
        "backups",
        <BackupSettings setSettings={setSettings} tasks={tasks} />,
      )}
    </>
  );
  return (
    <Stack>
      <PageHeader
        title={t(
          setup
            ? "setup"
            : sections.find((section) => section.value === selected)!.label,
        )}
      />
      {content}
    </Stack>
  );
}
