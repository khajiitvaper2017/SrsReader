import { definitionText } from "@/dictionaries/definitions";
import type { Meaning } from "@/dictionaries/model";
import type { Vocabulary } from "@/vocabulary/model";

export const meaningKey = (meaning: Meaning) =>
  JSON.stringify([
    meaning.dictionaryId,
    meaning.tags,
    meaning.definitions.map((definition) => definitionText(definition)),
  ]);

export function applyDefinitionOverrides(
  meanings: Meaning[],
  word: Vocabulary | undefined,
) {
  const keys = new Set(meanings.map(meaningKey));
  const retained = (word?.meanings || []).filter(
    (meaning) =>
      word?.definitionOverrides?.[meaningKey(meaning)] &&
      !keys.has(meaningKey(meaning)),
  );
  return [...meanings, ...retained].map((meaning) => ({
    ...meaning,
    customDefinitions: word?.definitionOverrides?.[meaningKey(meaning)],
  }));
}
