import {
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { localVoices } from "@/audio/playback";
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
  useEffect(() => {
    void localVoices().then(setVoices);
  }, []);
  const languageVoices = voices.filter(
    (voice) => voice.lang.split("-")[0] === settings.studyLanguage,
  );
  const sourceNames = {
    commons: t("audio_source_commons"),
    languagePod101: "LanguagePod101",
    forvo: "Forvo",
  };
  async function saveSources(sources: Settings["audioSources"]) {
    setSaving(true);
    try {
      await update({ audioSources: sources });
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
    void saveSources(sources);
  }
  return (
    <Paper>
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
        <Switch
          label={t("download_natural_pronunciations")}
          description={t(
            "downloads_from_audio_providers_when_playing_or_saving",
          )}
          checked={settings.audioDownloads}
          onChange={(event) =>
            void update({ audioDownloads: event.target.checked })
          }
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
            {(source, handle) => (
              <Group wrap="nowrap">
                {handle}
                <Switch
                  flex={1}
                  miw={0}
                  label={sourceNames[source.type]}
                  checked={source.enabled}
                  disabled={saving}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    void saveSources(
                      settings.audioSources.map((item) =>
                        item.type === source.type ? { ...item, enabled } : item,
                      ),
                    );
                  }}
                />
              </Group>
            )}
          </SortableList>
        </Stack>
        <Switch
          label={t("normalize_recording_volume")}
          description={t("normalize_recording_volume_help")}
          checked={settings.normalizeAudio}
          onChange={(event) =>
            void update({ normalizeAudio: event.target.checked })
          }
        />
        <Switch
          label={t("play_audio_on_reveal")}
          checked={settings.autoplay}
          onChange={(event) => void update({ autoplay: event.target.checked })}
        />
      </Stack>
    </Paper>
  );
}
