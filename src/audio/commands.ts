import type { Request } from "@/audio/contracts";
import {
  cacheAudioSource,
  cachePronunciation,
  findPronunciations,
} from "@/audio/pronunciations";
import { getAudio } from "@/audio/storage";
import { notify } from "@/background/events";
import { srsWrite } from "@/platform/locks";
import type { Settings } from "@/settings/model";
import { getSettings, saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { getWord } from "@/vocabulary/storage";

export function handleAudio(request: Request, settings: Settings) {
  return request.action === "setAudioSources"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "setAudioSources": {
      const next = { ...settings, audioSources: request.sources };
      await saveSettings(next);
      await notify(undefined, "settings");
      return next;
    }
    case "audioSources": {
      const [language, lemma, reading] = JSON.parse(request.id) as [
        string,
        string,
        string,
      ];
      return findPronunciations(language, lemma, reading, settings);
    }
    case "audio": {
      if (request.source) {
        if (request.source.id !== request.id)
          throw new Error(t("invalid_audio_source"));
        const record = await cacheAudioSource(
          request.source,
          settings.audioDialects[request.source.language] ?? [
            request.source.language,
          ],
        );
        if (!record) throw new Error(t("audio_source_unavailable"));
        const { blob, ...info } = record;
        return info;
      }
      if (!request.download) {
        const saved = await getAudio(request.id);
        if (!saved) return null;
        const { blob, ...info } = saved;
        return info;
      }
      const word = await getWord(request.id);
      const identity = JSON.parse(request.id) as [string, string, string];
      const record = await cachePronunciation(
        word?.language || identity[0],
        word?.lemma || identity[1],
        word?.reading || identity[2],
        settings,
      );
      if (!record) return null;
      const { blob, ...info } = record;
      return info;
    }
  }
}
