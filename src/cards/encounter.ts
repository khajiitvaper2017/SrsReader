import type { CardEncounter } from "@/cards/model";
import { dictionaryTagValues } from "@/dictionaries/grammar";
import type { Meaning } from "@/dictionaries/model";
import type { Occurrence } from "@/languages/analysis";
import { grammarFeatures } from "@/cards/encounter-key";
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
  Object.assign(encounter, grammarFeatures(analysis.grammar));
  return encounter;
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
