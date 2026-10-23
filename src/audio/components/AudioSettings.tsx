import { Paper, Select, Stack, Switch, Title } from "@mantine/core";
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
            "downloads_from_wikimedia_commons_when_playing_or_saving",
          )}
          checked={settings.audioDownloads}
          onChange={(event) =>
            void update({ audioDownloads: event.target.checked })
          }
        />
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
