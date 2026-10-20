import {
  Group,
  NativeSelect,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
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
  return (
    <Paper mb="md">
      <Stack gap="md">
        <Title order={2}>{t("pronunciation")}</Title>
        <Switch
          checked={settings.audioDownloads}
          onChange={(event) =>
            void update({ audioDownloads: event.target.checked })
          }
          aria-label={t("download_natural_pronunciations")}
          label={
            <span>
              <strong>{t("download_natural_pronunciations")}</strong>
              <Text component="small" size="xs" c="dimmed" display="block">
                {t(
                  "downloads_from_wikimedia_commons_when_playing_or_saving",
                )}{" "}
              </Text>
            </span>
          }
        />
        <Switch
          checked={settings.normalizeAudio}
          onChange={(event) =>
            void update({ normalizeAudio: event.target.checked })
          }
          aria-label={t("normalize_recording_volume")}
          label={
            <span>
              <strong>{t("normalize_recording_volume")}</strong>
              <Text component="small" size="xs" c="dimmed" display="block">
                {t("normalize_recording_volume_help")}
              </Text>
            </span>
          }
        />
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("local_voice")}</strong>
            <Text component="small" size="xs" c="dimmed" display="block">
              {voices.some(
                (v) => v.lang.split("-")[0] === settings.studyLanguage,
              )
                ? t("used_for_sentences_and_missing_recordings")
                : t("no_voice_found_install_one_in_your_system", {
                    value1: languageName(settings.studyLanguage),
                  })}
            </Text>
          </span>
          <NativeSelect
            value={settings.voice}
            onChange={(event) => {
              const value = event.currentTarget.value;
              return void update({ voice: value });
            }}
            aria-label={t("local_voice")}
            w={160}
            maw="50%"
          >
            <option value="">{t("automatic")}</option>
            {voices
              .filter((v) => v.lang.split("-")[0] === settings.studyLanguage)
              .map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name}
                </option>
              ))}
          </NativeSelect>
        </Group>
        <Switch
          checked={settings.autoplay}
          onChange={(event) => void update({ autoplay: event.target.checked })}
          aria-label={t("play_audio_on_reveal")}
          label={
            <span>
              <strong>{t("play_audio_on_reveal")}</strong>
            </span>
          }
        />
      </Stack>
    </Paper>
  );
}
