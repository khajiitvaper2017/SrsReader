import type { Request } from "@/audio/contracts";
import {
  cacheAudioSource,
  cachePronunciation,
  findPronunciations,
} from "@/audio/pronunciations";
import { getAudio } from "@/audio/storage";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";

export const handleAudio = execute;
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "audioSources": {
      const [language, lemma, reading] = JSON.parse(request.id) as [
        string,
        string,
        string,
      ];
      return findPronunciations(language, lemma, reading);
    }
    case "audio": {
      if (request.source) {
        if (request.source.id !== request.id)
          throw new Error(t("invalid_audio_source"));
        const record = await cacheAudioSource(request.source);
        if (!record) throw new Error(t("audio_source_unavailable"));
        const { blob, ...info } = record;
        return info;
      }
      const saved = await getAudio(request.id);
      if (saved) {
        const { blob, ...info } = saved;
        return info;
      }
      if (!request.download || !settings.audioDownloads) return null;
      const word = await db.vocabulary.get(request.id);
      const identity = JSON.parse(request.id) as [string, string, string];
      const record = await cachePronunciation(
        word?.language || identity[0],
        word?.lemma || identity[1],
        word?.reading || identity[2],
      );
      if (!record) return null;
      const { blob, ...info } = record;
      return info;
    }
  }
}
