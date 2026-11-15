import {
  Accordion,
  Group,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  Title,
} from "@mantine/core";
import { localVoices } from "@/audio/playback";
import {
  audioDialectSchema,
  audioDialectSuggestions,
} from "@/audio/preferences";
import { languageName } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { SortableList } from "@/shared/ui/SortableList";
import { useEffect, useState } from "react";
export function AudioSettings({
  settings,
  onChange: update,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialectError, setDialectError] = useState(false);
  useEffect(() => {
    void localVoices().then(setVoices);
  }, []);
  useEffect(() => setDialectError(false), [settings.studyLanguage]);
  const languageVoices = voices.filter(
    (voice) => voice.lang.split("-")[0] === settings.studyLanguage,
  );
  const sourceNames = {
    commons: t("audio_source_commons"),
    languagePod101: "LanguagePod101",
    forvo: "Forvo",
  };
  async function save(patch: Partial<Settings>) {
    setSaving(true);
    try {
      await update(patch);
    } finally {
      setSaving(false);
    }
  }
  function moveSource(id: string, target: string) {
    const sources = [...settings.audioSources];
    const index = sources.findIndex((source) => source.type === id);
    const targetIndex = sources.findIndex((source) => source.type === target);
    const [source] = sources.splice(index, 1);
    sources.splice(targetIndex, 0, source!);
    void save({ audioSources: sources });
  }
  return (
    <Stack>
      <Title order={2}>{t("pronunciation")}</Title>
      <Select
        searchable
        label={t("local_voice")}
        description={
          languageVoices.length
            ? t("used_for_sentences_and_missing_recordings")
            : t("no_voice_found_install_one_in_your_system", {
                value1: languageName(settings.studyLanguage),
              })
        }
        value={settings.voice}
        onChange={(voice) => void update({ voice: voice! })}
        data={[
          { value: "", label: t("automatic") },
          ...languageVoices.map((voice) => ({
            value: voice.voiceURI,
            label: voice.name,
          })),
        ]}
      />
      <Stack gap="xs">
        <Text fw={500}>{t("audio_sources")}</Text>
        <Text variant="supporting">{t("audio_sources_order_help")}</Text>
        <SortableList
          items={settings.audioSources}
          getId={(source) => source.type}
          getLabel={(source) => sourceNames[source.type]}
          onMove={moveSource}
          disabled={saving}
        >
          {(source, controls) => (
            <Group wrap="nowrap">
              {controls}
              <Switch
                labelPosition="left"
                w="100%"
                styles={{
                  body: { width: "100%", minHeight: 44, alignItems: "center" },
                  labelWrapper: { flex: 1 },
                  track: { flexShrink: 0 },
                }}
                flex={1}
                miw={0}
                label={sourceNames[source.type]}
                checked={source.enabled}
                disabled={saving}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  void save({
                    audioSources: settings.audioSources.map((item) =>
                      item.type === source.type ? { ...item, enabled } : item,
                    ),
                  });
                }}
              />
            </Group>
          )}
        </SortableList>
      </Stack>
      <Accordion keepMounted keepMountedMode="display-none">
        <Accordion.Item value="dialects">
          <Accordion.Control>{t("preferred_dialects")}</Accordion.Control>
          <Accordion.Panel>
            <TagsInput
              label={t("preferred_dialects")}
              description={t("preferred_dialects_help", {
                language: settings.studyLanguage,
              })}
              error={
                dialectError &&
                t("invalid_dialect_code", { language: settings.studyLanguage })
              }
              data={[
                settings.studyLanguage,
                ...(audioDialectSuggestions[settings.studyLanguage] ?? []).map(
                  (suffix) => `${settings.studyLanguage}-${suffix}`,
                ),
              ]}
              value={
                settings.audioDialects[settings.studyLanguage] ?? [
                  settings.studyLanguage,
                ]
              }
              withPillsReorder
              disabled={saving}
              onChange={(values) => {
                const dialects = audioDialectSchema.array().safeParse(values);
                if (
                  !dialects.success ||
                  dialects.data.some(
                    (value) =>
                      value !== settings.studyLanguage &&
                      !value.startsWith(`${settings.studyLanguage}-`),
                  )
                ) {
                  setDialectError(true);
                  return;
                }
                setDialectError(false);
                void save({
                  audioDialects: {
                    ...settings.audioDialects,
                    [settings.studyLanguage]: dialects.data,
                  },
                });
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Switch
        labelPosition="left"
        w="100%"
        styles={{
          body: { width: "100%", minHeight: 44, alignItems: "center" },
          labelWrapper: { flex: 1 },
          track: { flexShrink: 0 },
        }}
        label={t("normalize_recording_volume")}
        description={t("normalize_recording_volume_help")}
        checked={settings.normalizeAudio}
        onChange={(event) =>
          void update({ normalizeAudio: event.target.checked })
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
        label={t("play_audio_on_reveal")}
        checked={settings.autoplay}
        onChange={(event) => void update({ autoplay: event.target.checked })}
      />
    </Stack>
  );
}
