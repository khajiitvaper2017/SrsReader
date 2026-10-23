import { cachePronunciation } from "@/audio/pronunciations";
import type { LookupWord } from "@/dictionaries/model";
import { getSettings } from "@/settings/store";

export function cacheAudio(word: LookupWord) {
  void getSettings()
    .then((settings) =>
      cachePronunciation(
        word.language,
        word.lemma,
        word.reading,
        settings.audioSources,
      ),
    )
    .catch(console.warn);
}
