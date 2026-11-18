import { isOnlineDictionary } from "@/dictionaries/online";
import type { Dictionary, Meaning, LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { folded, normalize } from "@/languages/text";

type DisplaySettings = Pick<Settings, "dictionaryPreferences" | "nechybujte">;

export type DictionaryRole = "vocabulary" | "frequency";

export type DictionaryDisplay = "show" | "fallback" | "hide";

export function dictionaryDisplay(
  id: string,
  settings: DisplaySettings,
): DictionaryDisplay {
  const preference = settings.dictionaryPreferences[id];
  const enabled =
    id === "nechybujte"
      ? settings.nechybujte
      : isOnlineDictionary(id)
        ? preference?.enabled === true
        : preference?.enabled !== false;
  if (!enabled) return "hide";
  return (preference?.fallback ?? isOnlineDictionary(id)) ? "fallback" : "show";
}

export function displayedMeanings(
  meanings: Meaning[],
  settings: DisplaySettings,
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
        Number.MAX_SAFE_INTEGER - (isOnlineDictionary(id) ? 0 : 1));
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
  return visible.sort(
    (a, b) =>
      Number(b.dictionaryId === "personal") -
      Number(a.dictionaryId === "personal"),
  );
}

export function displayedWords(
  words: LookupWord[],
  settings: DisplaySettings,
  dictionaries: Dictionary[],
  preferredLemmas: string[],
  saved: ReadonlyMap<string, unknown>,
) {
  function mergeContent(
    target: LookupWord,
    forms: string[],
    meanings: Meaning[],
  ) {
    for (const form of forms)
      if (!target.forms.includes(form)) target.forms.push(form);
    for (const meaning of meanings)
      if (
        !target.meanings.some(
          (current) => JSON.stringify(current) === JSON.stringify(meaning),
        )
      )
        target.meanings.push(meaning);
  }
  const merged = new Map<string, LookupWord>();
  for (const word of words) {
    const existing = merged.get(word.id);
    if (existing) mergeContent(existing, word.forms, word.meanings);
    else
      merged.set(word.id, {
        ...word,
        forms: [...word.forms],
        meanings: [...word.meanings],
      });
  }
  const covered = new Set<string>();
  for (const word of merged.values()) {
    if (!word.reading || !saved.has(word.id)) continue;
    const general = words.find(
      (candidate) =>
        !candidate.reading &&
        normalize(candidate.lemma) === normalize(word.lemma) &&
        candidate.language === word.language,
    );
    const base = general && merged.get(general.id);
    if (!base) continue;
    // Unqualified dictionary entries also describe saved cards with a reading.
    mergeContent(
      word,
      base.forms,
      base.meanings.filter((meaning) => meaning.dictionaryId !== "personal"),
    );
    if (!saved.has(base.id) && !word.importedGenders?.length)
      covered.add(base.id);
  }
  words = [...merged.values()].filter((word) => !covered.has(word.id));
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
    if (index < 0) return preferredLemmas.length * 2;
    return (
      index * 2 +
      Number(
        word.language === "de" &&
          normalize(preferredLemmas[index]!) !== normalize(word.lemma),
      )
    );
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
      return meanings.length || !word.meanings.length
        ? [{ ...word, meanings }]
        : [];
    })
    .sort((a, b) => priority(a) - priority(b));
}
