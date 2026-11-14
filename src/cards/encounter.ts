import type { CardEncounter } from "@/cards/model";
import { dictionaryTagValues } from "@/dictionaries/grammar";
import type { Meaning } from "@/dictionaries/model";
import type { Occurrence } from "@/languages/analysis";
import { normalize } from "@/languages/text";
import { occurrenceAnalysis } from "@/languages/udpipe";
import { db } from "@/platform/database/db";
import { contextSchema, type ReadingContext } from "@/vocabulary/model";

export async function resolveCardEncounter(
  context?: ReadingContext,
  occurrence?: Occurrence,
): Promise<CardEncounter | undefined> {
  const parsed = contextSchema.safeParse(context);
  if (!parsed.success || !parsed.data.surface.trim()) return;
  const encounter: CardEncounter = {
    context: parsed.data,
    pos: "",
    feats: {},
  };
  if (!occurrence) return encounter;
  const record = await db.analyses.get(occurrence.key);
  const offset = occurrence.start - encounter.context.start;
  if (
    !record ||
    offset < 0 ||
    record.text.slice(offset, offset + encounter.context.sentence.length) !==
      encounter.context.sentence ||
    (record.language &&
      encounter.context.language &&
      record.language !== encounter.context.language)
  )
    return encounter;
  const analysis = await occurrenceAnalysis(
    occurrence,
    encounter.context.surface,
  );
  if (!analysis) return encounter;
  const { sentence, tokenIds, group } = analysis.grammar;
  const tokens = sentence.tokens.filter((token) => tokenIds.includes(token.id));
  if (group) {
    encounter.pos = "VERB";
    encounter.feats = { ...group.feats };
  } else {
    encounter.pos = [...new Set(tokens.map((token) => token.upos))]
      .sort()
      .join(",");
    for (const token of tokens) {
      for (const [feature, value] of Object.entries(token.feats)) {
        encounter.feats[feature] = [
          ...new Set(
            [encounter.feats[feature], value]
              .filter(Boolean)
              .flatMap((part) => part!.split(",")),
          ),
        ]
          .sort()
          .join(",");
      }
    }
  }
  const noun = tokens.find((token) => /^(NOUN|PROPN)$/u.test(token.upos));
  const determiner =
    noun &&
    sentence.tokens.find(
      (token) =>
        token.head === noun.id &&
        token.upos === "DET" &&
        /^det(?::|$)/u.test(token.deprel) &&
        token.start !== undefined &&
        token.end !== undefined &&
        token.start >= offset &&
        token.end <= offset + encounter.context.sentence.length,
    );
  if (determiner) encounter.article = determiner.form;
  return encounter;
}

export function cardEncounterKey(encounter: CardEncounter): string {
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

export function meaningsForEncounter(
  meanings: Meaning[],
  encounter: CardEncounter,
): Meaning[] {
  const parts = encounter.pos.split(",").filter(Boolean);
  if (
    encounter.feats.VerbForm === "Part" &&
    parts.some((part) => part === "ADJ" || part === "ADV")
  )
    parts.push("VERB", "AUX");
  return meanings.filter((meaning) => {
    if (
      meaning.dictionaryId === "personal" ||
      meaning.customDefinitions !== undefined
    )
      return true;
    return ["UPOS", "Gender", "Animacy", "Aspect"].every((feature) => {
      const actual =
        feature === "UPOS"
          ? parts
          : (encounter.feats[feature]?.split(",") ?? []);
      const allowed = dictionaryTagValues([meaning], feature);
      return (
        !actual.length ||
        !allowed.length ||
        actual.some((value) => allowed.includes(value))
      );
    });
  });
}
