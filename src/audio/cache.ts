import { cachePronunciation } from "@/audio/pronunciations";
import type { LookupWord } from "@/dictionaries/model";
import { getSettings } from "@/settings/store";

export function cacheAudio(word: LookupWord) {
  void getSettings()
    .then((settings) =>
      settings.audioDownloads
        ? cachePronunciation(word.language, word.lemma, word.reading)
        : null,
    )
    .catch(console.warn);
}
