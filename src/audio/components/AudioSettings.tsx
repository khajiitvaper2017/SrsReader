import { localVoices } from "@/audio/playback";
import { languageName } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";
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
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>{t("pronunciation")}</h2>
        </div>
      </div>
      <label className="setting-row">
        <span>
          <strong>{t("download_natural_pronunciations")}</strong>
          <small>
            {t("downloads_from_wikimedia_commons_when_playing_or_saving")}{" "}
          </small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.audioDownloads}
          onChange={(event) =>
            void update({ audioDownloads: event.target.checked })
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("normalize_recording_volume")}</strong>
          <small>{t("normalize_recording_volume_help")}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.normalizeAudio}
          onChange={(event) =>
            void update({ normalizeAudio: event.target.checked })
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("local_voice")}</strong>
          <small>
            {voices.some((v) => v.lang.split("-")[0] === settings.studyLanguage)
              ? t("used_for_sentences_and_missing_recordings")
              : t("no_voice_found_install_one_in_your_system", {
                  value1: languageName(settings.studyLanguage),
                })}
          </small>
        </span>
        <Select
          value={settings.voice}
          onValueChange={(value) => void update({ voice: value })}
        >
          <SelectOption value="">{t("automatic")}</SelectOption>
          {voices
            .filter((v) => v.lang.split("-")[0] === settings.studyLanguage)
            .map((voice) => (
              <SelectOption key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </SelectOption>
            ))}
        </Select>
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("play_audio_on_reveal")}</strong>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.autoplay}
          onChange={(event) => void update({ autoplay: event.target.checked })}
        />
      </label>
    </section>
  );
}
