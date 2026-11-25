import {
  dictionaryTagValues,
  importedPartValues,
} from "@/dictionaries/grammar";
import { lookup } from "@/dictionaries/resolve";
import { germanReflexiveBase } from "@/languages/text";
import type { Settings } from "@/settings/model";

export async function lookupCardWord(
  lemma: string,
  reading: string,
  settings: Settings,
  {
    imported = [],
    localOnly = true,
  }: { imported?: string[]; localOnly?: boolean } = {},
) {
  async function exact(term: string) {
    const { words } = await lookup(term, settings, {
      reading,
      localOnly,
    });
    const exactWords = words.filter(
      (word) => word.lemma.normalize() === term.normalize(),
    );
    const specific = exactWords.find(
      (word) => word.reading.normalize() === reading.normalize(),
    );
    const general = exactWords.find((word) => !word.reading);
    if (
      specific?.meanings.some((meaning) => meaning.dictionaryId !== "personal")
    )
      return specific;
    return general?.meanings.length ? general : (specific ?? general);
  }
  if (
    settings.studyLanguage === "de" &&
    /^\p{Lu}[\p{L}\p{M}]*$/u.test(lemma) &&
    (importedPartValues(imported).includes("INTJ") ||
      imported.some((part) => /^phrase$/i.test(part)))
  ) {
    const lower = await exact(lemma.toLowerCase());
    if (lower?.meanings.length) return lower;
  }
  const word = await exact(lemma);
  const base = germanReflexiveBase(settings.studyLanguage, lemma);
  if (
    !base ||
    word?.meanings.some((meaning) => meaning.dictionaryId !== "personal")
  )
    return word;
  const result = await exact(base);
  if (!result) return word;
  const verbs = result.meanings.filter((meaning) => {
    const parts = dictionaryTagValues([meaning], "UPOS");
    return (
      meaning.dictionaryId !== "personal" &&
      (!parts.length || parts.includes("VERB") || parts.includes("AUX"))
    );
  });
  const reflexive = verbs.filter((meaning) =>
    dictionaryTagValues([meaning], "Reflex").includes("Yes"),
  );
  return {
    ...(word ?? result),
    meanings: [
      ...(word?.meanings ?? []),
      ...(reflexive.length ? reflexive : verbs),
    ],
  };
}
