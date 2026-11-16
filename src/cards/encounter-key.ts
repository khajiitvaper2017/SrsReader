import { normalize } from "@/languages/text";
import type { OccurrenceGrammar } from "@/languages/analysis";

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
