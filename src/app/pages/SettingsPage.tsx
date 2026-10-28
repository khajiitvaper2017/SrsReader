import type { DictionaryRole } from "@/dictionaries/display";
import { isOnlineDictionary } from "@/dictionaries/online";
import {
  Anchor,
  Button,
  Group,
  Paper,
  Switch,
  Tabs,
  Text,
  Stack,
  Title,
} from "@mantine/core";
import { AudioSettings } from "@/audio/components/AudioSettings";
import { audioClient } from "@/audio/client";
import { BackupSettings } from "@/backups/components/BackupSettings";
import { dictionariesClient } from "@/dictionaries/client";
import { DictionarySettings } from "@/dictionaries/components/DictionarySettings";
import type { Dictionary } from "@/dictionaries/model";
import { examplesClient } from "@/examples/client";
import {
  languageIso3,
  languageLabel,
  morphologyLanguage,
} from "@/languages/codes";
import { LanguageDataSettings } from "@/languages/components/LanguageDataSettings";
import { LanguageSettings } from "@/languages/components/LanguageSettings";
import { useLanguageData } from "@/languages/hooks/useLanguageData";
import { installedMorphology } from "@/languages/storage";
import { LookupSettings } from "@/reader/components/LookupSettings";
import { ReadingSettings } from "@/reader/components/ReadingSettings";
import { settingsClient } from "@/settings/client";
import type { useSettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { ReviewSettings } from "@/srs/components/ReviewSettings";
import { ReviewControls } from "@/srs/components/ReviewControls";
import {
  BookOpen,
  Check,
  Database,
  Languages,
  Keyboard,
  MousePointer2,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { WordColors } from "@/settings/components/WordColors";
import { AppearanceSettings } from "@/settings/components/AppearanceSettings";
import {
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
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const languages = [
    ...new Set([
      ...preferences.studyLanguages,
      ...(setup || tab === "dictionaries"
        ? dictionaries
            .filter((dictionary) => !isOnlineDictionary(dictionary.id))
            .map((dictionary) => dictionary.language)
        : []),
    ]),
  ];
  const selectedLanguage = languages.includes(language)
    ? language
    : preferences.studyLanguage;
  const settings = useMemo(
    () => ({ ...preferences, studyLanguage: selectedLanguage }),
    [preferences, selectedLanguage],
  );
  const { setError, busy, setBusy, setProgress } = tasks;
  const languageData = useLanguageData(settings.studyLanguage, tasks);
  const load = useCallback(() => {
    void dictionariesClient({ action: "dictionaries" })
      .then(setDictionaries)
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
  useChanges(load, ["dictionaries", "frequency", "settings"]);
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
          : await settingsClient({ action: "setSettings", value: next }),
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
      for (const language of settings.studyLanguages) {
        if (
          morphologyLanguage(language) &&
          !(await installedMorphology(language))
        )
          await languageData.install("morphology", undefined, language);
        if (
          languageIso3(language) &&
          !(await examplesClient({ action: "exampleCorpus", language }))
            .installed
        )
          await languageData.install("examples", undefined, language);
      }
      setSettings(
        await settingsClient({
          action: "setSettings",
          value: { ...preferences, setupComplete: true },
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
      value: "controls",
      label: t("settings_controls"),
      icon: <Keyboard size={16} />,
    },
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
  const dictionaryRole: DictionaryRole =
    dictionaryTab === "frequency" ? "frequency" : "vocabulary";
  function navigate(
    section: string,
    language = selectedLanguage,
    role = dictionaryRole,
  ) {
    const params = new URLSearchParams({ language, dictionary: role });
    location.hash = `${setup ? "setup" : `settings/${section}`}?${params}`;
  }
  function withLanguageTabs(content: ReactNode) {
    return (
      <Tabs
        value={selectedLanguage}
        onChange={(value) => {
          if (value) navigate(selected, value);
        }}
      >
        {languages.length > 0 && (
          <Tabs.List mb="md" aria-label={t("language_settings_for")}>
            {languages.map((value) => (
              <Tabs.Tab
                key={value}
                value={value}
                disabled={busy}
                data-srs-reader
              >
                {languageLabel(value)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        )}
        <Tabs.Panel value={selectedLanguage}>{content}</Tabs.Panel>
      </Tabs>
    );
  }
  const dictionarySettings = (
    <DictionarySettings
      settings={settings}
      dictionaries={dictionaries}
      reload={load}
      tasks={tasks}
      role={dictionaryRole}
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
    withLanguageTabs(
      <>
        <LanguageSettings settings={settings} onChange={update} setup />
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
      </>,
    )
  ) : (
    <Tabs
      value={selected}
      onChange={(value) => {
        if (value) navigate(value);
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
        <Stack>
          <LanguageSettings settings={settings} onChange={update} />
          <AppearanceSettings settings={settings} onChange={update} />
          <Paper>
            <Group justify="space-between">
              <Group>
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
        {withLanguageTabs(
          <Stack>
            <ReadingSettings
              settings={settings}
              onChange={update}
              dictionaries={dictionaries}
            />
            <WordColors settings={settings} onChange={update} />
          </Stack>,
        )}
      </Tabs.Panel>
      <Tabs.Panel value="dictionaries">
        {withLanguageTabs(<Stack>{dictionarySettings}</Stack>)}
      </Tabs.Panel>
      <Tabs.Panel value="review">
        {withLanguageTabs(
          <ReviewSettings
            settings={settings}
            onChange={update}
            dictionaries={dictionaries}
            onError={setError}
          />,
        )}
      </Tabs.Panel>
      <Tabs.Panel value="controls">
        <Stack>
          <LookupSettings settings={settings} onChange={update} />
          <ReviewControls settings={settings} onChange={update} />
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="audio">
        {withLanguageTabs(
          <Stack>
            <AudioSettings settings={settings} onChange={update} />
            <Paper>
              <Stack>
                <Title order={2}>{t("translation")}</Title>
                <Switch
                  label={t("auto_translate_sentences")}
                  description={t("auto_translate_sentences_help")}
                  checked={settings.autoTranslateSentences}
                  onChange={(event) =>
                    void update({
                      autoTranslateSentences: event.currentTarget.checked,
                    })
                  }
                />
                <Switch
                  label={t("auto_translate_definitions")}
                  description={t("auto_translate_definitions_help")}
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
                <Anchor href="#docs/reading">{t("docs_reading")}</Anchor>
              </Stack>
            </Paper>
          </Stack>,
        )}
      </Tabs.Panel>
      <Tabs.Panel value="backups">
        <BackupSettings setSettings={setSettings} tasks={tasks} />
      </Tabs.Panel>
    </Tabs>
  );
  return (
    <Stack>
      <Stack>
        <Title order={1}>{t(setup ? "setup" : "settings")}</Title>
        {setup && <Text variant="supporting">{t("settings_setup_intro")}</Text>}
      </Stack>
      {content}
    </Stack>
  );
}
