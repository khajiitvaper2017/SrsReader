import type { LookupResult } from "@/dictionaries/model";
import { folded } from "@/languages/text";

export const onlineDictionaries = [
  { id: "nechybujte", language: "cs", target: "cs" },
  { id: "spanishdict", language: "es", target: "en" },
] as const;

export const isOnlineDictionary = (id: string) =>
  onlineDictionaries.some((dictionary) => dictionary.id === id);

export function mergeOnline(
  local: LookupResult,
  online: LookupResult,
  term: string,
): LookupResult {
  const words = [...local.words];
  for (const word of online.words) {
    const index = words.findIndex((candidate) => candidate.id === word.id);
    if (index < 0) words.push(word);
    else
      words[index] = {
        ...words[index]!,
        meanings: [
          ...words[index]!.meanings.filter(
            (meaning) =>
              !word.meanings.some(
                (entry) => entry.dictionaryId === meaning.dictionaryId,
              ),
          ),
          ...word.meanings,
        ],
      };
  }
  words.sort(
    (a, b) =>
      Number(folded(b.lemma, b.language) === folded(term, b.language)) -
      Number(folded(a.lemma, a.language) === folded(term, a.language)),
  );
  return { words, unresolved: words.length ? [] : local.unresolved };
}
