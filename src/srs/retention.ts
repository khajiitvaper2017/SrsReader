import {
  harmonicRank,
  isRankSource,
  wordFrequencies,
} from "@/dictionaries/frequency";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import type { Vocabulary } from "@/vocabulary/model";

export async function effectiveRetention(
  word: Pick<Vocabulary, "language" | "lemma" | "reading"> & {
    retentionOverride?: number | null;
  },
  settings: Settings,
) {
  if (word.retentionOverride != null) return word.retentionOverride;
  if (!settings.dynamicRetention) return settings.retention;
  const dictionaries = await db.dictionaries.toArray();
  const sources = new Set(
    dictionaries
      .filter((dictionary) => isRankSource(dictionary, settings))
      .map((dictionary) => dictionary.id),
  );
  const ranks = (await wordFrequencies(word))
    .filter((row) => sources.has(row.id) && row.rank > 0)
    .map((row) => row.rank);
  if (!ranks.length) return settings.retention;
  const rank = harmonicRank(ranks);
  return settings.retentionBands.find(
    (band) => band.upTo === null || rank <= band.upTo,
  )!.retention;
}
