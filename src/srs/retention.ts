import {
  harmonicRank,
  isRankSource,
  wordFrequencies,
} from "@/dictionaries/frequency";
import { db } from "@/platform/database/db";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";
import { resolveRetention } from "@/srs/retention-policy";
import type { Vocabulary } from "@/vocabulary/model";

export async function effectiveRetention(
  word: Pick<Vocabulary, "language" | "lemma" | "reading"> & {
    retentionOverride?: number | null;
    wordId?: string;
  },
  settings: Settings,
) {
  if (word.retentionOverride != null)
    return resolveRetention(word.retentionOverride, null, settings);
  if ("wordId" in word && !word.wordId)
    return resolveRetention(null, null, settings);
  if (!settings.dynamicRetention) return resolveRetention(null, null, settings);
  const dictionaries = await db.dictionaries.toArray();
  const sources = new Set(
    dictionaries
      .filter((dictionary) => isRankSource(dictionary, settings))
      .map((dictionary) => dictionary.id),
  );
  const ranks = (await wordFrequencies(word))
    .filter((row) => sources.has(row.id) && row.rank > 0)
    .map((row) => row.rank);
  if (!ranks.length) return resolveRetention(null, null, settings);
  const rank = harmonicRank(ranks);
  return resolveRetention(null, rank, settings);
}
