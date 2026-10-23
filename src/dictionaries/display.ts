import type { Dictionary, Meaning, LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { folded } from "@/languages/text";

export type DictionaryDisplay = "show" | "fallback" | "hide";

export function dictionaryDisplay(
  id: string,
  settings: Settings,
): DictionaryDisplay {
  const preference = settings.dictionaryPreferences[id];
  const enabled =
    id === "nechybujte" ? settings.nechybujte : preference?.enabled !== false;
  if (!enabled) return "hide";
  return (preference?.fallback ?? id === "nechybujte") ? "fallback" : "show";
}

export function displayedMeanings(
  meanings: Meaning[],
  settings: Settings,
  dictionaries: Dictionary[],
) {
  const metadata = new Map(
    dictionaries.map((dictionary) => [dictionary.id, dictionary]),
  );
  const order = (id: string) =>
    id === "personal"
      ? Number.MAX_SAFE_INTEGER
      : (settings.dictionaryPreferences[id]?.order ??
        metadata.get(id)?.order ??
        Number.MAX_SAFE_INTEGER - (id === "nechybujte" ? 0 : 1));
  const visible: Meaning[] = [];
  for (const meaning of [...meanings].sort(
    (a, b) => order(a.dictionaryId) - order(b.dictionaryId),
  )) {
    const mode =
      metadata.get(meaning.dictionaryId)?.enabled === false
        ? "hide"
        : dictionaryDisplay(meaning.dictionaryId, settings);
    if (
      mode === "hide" ||
      (mode === "fallback" &&
        visible.some(
          (above) => order(above.dictionaryId) < order(meaning.dictionaryId),
        ))
    )
      continue;
    visible.push(meaning);
  }
  return visible;
}

export function displayedWords(
  words: LookupWord[],
  settings: Settings,
  dictionaries: Dictionary[],
  preferredLemmas: string[] = [],
) {
  const merged = new Map<string, LookupWord>();
  for (const word of words) {
    const existing = merged.get(word.id);
    if (!existing)
      merged.set(word.id, { ...word, meanings: [...word.meanings] });
    else
      for (const meaning of word.meanings)
        if (
          !existing.meanings.some(
            (current) => JSON.stringify(current) === JSON.stringify(meaning),
          )
        )
          existing.meanings.push(meaning);
  }
  words = [...merged.values()];
  const visible = displayedMeanings(
    words.flatMap((word) => word.meanings),
    settings,
    dictionaries,
  );
  const order = new Map(
    visible.map((meaning, index) => [meaning.dictionaryId, index]),
  );
  const priority = (word: LookupWord) => {
    const index = preferredLemmas.findIndex(
      (lemma) =>
        folded(lemma, word.language) === folded(word.lemma, word.language),
    );
    return index < 0 ? preferredLemmas.length : index;
  };
  return words
    .flatMap((word) => {
      const meanings = preferredLemmas.some(
        (lemma) =>
          folded(lemma, word.language) === folded(word.lemma, word.language),
      )
        ? displayedMeanings(word.meanings, settings, dictionaries)
        : word.meanings
            .filter((meaning) => order.has(meaning.dictionaryId))
            .sort(
              (a, b) => order.get(a.dictionaryId)! - order.get(b.dictionaryId)!,
            );
      return meanings.length ? [{ ...word, meanings }] : [];
    })
    .sort((a, b) => priority(a) - priority(b));
}
