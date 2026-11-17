import { normalize } from "@/languages/text";
import type { OccurrenceGrammar } from "@/languages/analysis";
import type { Note } from "@/cards/model";
import { germanNounField } from "@/cards/noun-article";

export type EncounterIdentity = {
  context: { surface: string; language?: string };
  pos: string;
  feats: Record<string, string>;
};

export function cardEncounterKey(encounter: EncounterIdentity): string {
  return JSON.stringify([
    normalize(encounter.context.surface)
      .trim()
      .replace(/\s+/gu, " ")
      .toLocaleLowerCase(encounter.context.language || "und"),
    encounter.pos,
    Object.entries(encounter.feats)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([feature, value]) => [
        feature,
        [...new Set(value.split(","))].sort().join(","),
      ]),
  ]);
}

export type ReadingCardIdentity = {
  encounterKey?: string;
  importedGenders?: readonly string[];
};

export function readingCardIdentity(
  note: Note,
  lemma = "",
): ReadingCardIdentity {
  if (note.encounter) return { encounterKey: cardEncounterKey(note.encounter) };
  if (note.importedGenders) return { importedGenders: note.importedGenders };
  if (!note.sourceId && !Array.isArray(note.source?.importedNotes)) return {};
  const gender =
    note.language === "de" ? germanNounField(lemma).gender : undefined;
  return { importedGenders: gender ? [gender] : [] };
}

export function importedGendersMatch(
  importedGenders: readonly string[],
  pos: string,
  gender?: string,
) {
  return (
    !importedGenders.length ||
    ((!pos ||
      pos.split(",").some((part) => part === "NOUN" || part === "PROPN")) &&
      (!gender ||
        gender.split(",").some((value) => importedGenders.includes(value))))
  );
}

export function cardsForEncounter<T extends ReadingCardIdentity>(
  cards: readonly T[],
  key: string,
): readonly T[] {
  const exact = cards.filter((card) => card.encounterKey === key);
  if (exact.length) return exact;
  const imported = cards.filter((card) => card.importedGenders !== undefined);
  if (!imported.length) return imported;
  const [, pos, feats] = JSON.parse(key) as [
    string,
    string,
    [string, string][],
  ];
  const gender = feats.find(([feature]) => feature === "Gender")?.[1];
  return imported.filter((card) =>
    importedGendersMatch(card.importedGenders!, pos, gender),
  );
}

export function grammarFeatures(grammar: OccurrenceGrammar) {
  const { sentence, tokenIds, group } = grammar;
  if (group) return { pos: "VERB", feats: { ...group.feats } };
  const tokens = sentence.tokens.filter((token) => tokenIds.includes(token.id));
  const feats: Record<string, string> = {};
  for (const token of tokens)
    for (const [feature, value] of Object.entries(token.feats))
      feats[feature] = [
        ...new Set(
          [feats[feature], value]
            .filter(Boolean)
            .flatMap((part) => part!.split(",")),
        ),
      ]
        .sort()
        .join(",");
  return {
    pos: [...new Set(tokens.map((token) => token.upos))].sort().join(","),
    feats,
  };
}
