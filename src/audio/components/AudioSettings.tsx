import {
  ActionIcon,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { ArrowDown, ArrowUp } from "lucide-react";
import { localVoices } from "@/audio/playback";
import { languageName } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";
export function AudioSettings({
  settings,
  onChange: update,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
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
  function moveSource(index: number, direction: -1 | 1) {
    const sources = [...settings.audioSources];
    const [source] = sources.splice(index, 1);
    sources.splice(index + direction, 0, source!);
    void update({ audioSources: sources });
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
          {settings.audioSources.map((source, index) => (
            <Group key={source.type} wrap="nowrap" justify="space-between">
              <Switch
                flex={1}
                miw={0}
                label={sourceNames[source.type]}
                checked={source.enabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  void update({
                    audioSources: settings.audioSources.map((item, i) =>
                      i === index ? { ...item, enabled } : item,
                    ),
                  });
                }}
              />
              <Group gap="xs" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  disabled={index === 0}
                  aria-label={t("move_audio_source_up", {
                    source: sourceNames[source.type],
                  })}
                  title={t("move_audio_source_up", {
                    source: sourceNames[source.type],
                  })}
                  onClick={() => moveSource(index, -1)}
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  disabled={index === settings.audioSources.length - 1}
                  aria-label={t("move_audio_source_down", {
                    source: sourceNames[source.type],
                  })}
                  title={t("move_audio_source_down", {
                    source: sourceNames[source.type],
                  })}
                  onClick={() => moveSource(index, 1)}
                >
                  <ArrowDown aria-hidden="true" size={16} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
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
