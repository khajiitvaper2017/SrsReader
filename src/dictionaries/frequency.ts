import type { Dictionary, Frequency, LookupWord } from "@/dictionaries/model";
import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import type { Vocabulary } from "@/vocabulary/model";
import { listFrequencyDictionaries } from "@/dictionaries/storage";
import { getSettings } from "@/settings/store";

export function harmonicRank(ranks: number[]) {
  if (!ranks.length) return Infinity;
  return ranks.includes(0)
    ? 0
    : ranks.length / ranks.reduce((sum, rank) => sum + 1 / rank, 0);
}

function frequencyRank(rows: Frequency[], lemma: string, reading: string) {
  const matching = rows.filter(
    (row) => row.reading === null || row.reading === normalize(reading),
  );
  const exact = matching.filter((row) => row.key === normalize(lemma));
  const candidates = exact.length ? exact : matching;
  const withReading = candidates.filter((row) => row.reading !== null);
  return (withReading.length ? withReading : candidates).reduce(
    (min, row) => Math.min(min, row.rank),
    Infinity,
  );
}

type RankedFrequency = {
  id: string;
  title: string;
  rank: number;
};

// Activated revisions are immutable, so a new revision cannot reuse stale rows.
const frequencyCache = new Map<string, Frequency[]>();

async function frequencyData(
  words: Pick<LookupWord, "lemma" | "reading" | "language">[],
  settings: Settings,
) {
  const language = words[0]?.language ?? settings.studyLanguage;
  const dictionaries = (await listFrequencyDictionaries(settings)).filter(
    (dictionary) => dictionary.enabled && dictionary.language === language,
  );
  const keys = [...new Set(words.map((word) => folded(word.lemma, language)))];
  // Exact ranges use bulk reads instead of a cursor callback for every matching row.
  const rows = dictionaries.length
    ? await db.transaction("r", db.frequencies, async () =>
        (
          await Promise.all(
            dictionaries.flatMap((dictionary) =>
              keys.map((key) => {
                const indexKey = [dictionary.revisionId, key];
                const cacheKey = JSON.stringify(indexKey);
                const cached = frequencyCache.get(cacheKey);
                if (cached) return cached;
                return db.frequencies
                  .where("[revisionId+folded]")
                  .equals(indexKey)
                  .toArray()
                  .then((rows) => {
                    frequencyCache.set(cacheKey, rows);
                    if (frequencyCache.size > 50_000)
                      frequencyCache.delete(
                        frequencyCache.keys().next().value!,
                      );
                    return rows;
                  });
              }),
            ),
          )
        ).flat(),
      )
    : [];
  const byKey = new Map<string, Frequency[]>();
  for (const row of rows) {
    const group = byKey.get(row.folded) || [];
    group.push(row);
    byKey.set(row.folded, group);
  }
  return { dictionaries, byKey };
}

function matchingFrequencies(
  word: Pick<LookupWord, "lemma" | "reading" | "language">,
  data: Awaited<ReturnType<typeof frequencyData>>,
): RankedFrequency[] {
  const matching = data.byKey.get(folded(word.lemma, word.language)) || [];
  return data.dictionaries.flatMap((dictionary): RankedFrequency[] => {
    const rows = matching.filter(
      (row) => row.revisionId === dictionary.revisionId,
    );
    const rank = frequencyRank(rows, word.lemma, word.reading);
    return Number.isFinite(rank)
      ? [{ id: dictionary.id, title: dictionary.index.title, rank }]
      : [];
  });
}

export async function wordFrequencies(
  word: Pick<LookupWord, "lemma" | "reading" | "language">,
) {
  const settings = await getSettings();
  return matchingFrequencies(word, await frequencyData([word], settings));
}

export async function orderNewWords<
  T extends Pick<
    Vocabulary,
    "id" | "language" | "lemma" | "reading" | "created"
  >,
>(words: T[], settings: Settings) {
  if (!words.length) return words;
  const data = await frequencyData(
    words.filter((word) => !("wordId" in word) || !!word.wordId),
    settings,
  );
  const { dictionaries } = data;
  const ranks = new Map<string, number>();
  const maxFrequency = dictionaries.length
    ? Math.max(...dictionaries.map((dictionary) => dictionary.maxFrequency))
    : words.length;
  await Promise.all(
    words.map(async (word) => {
      const rank =
        "wordId" in word && !word.wordId
          ? Infinity
          : harmonicRank(
              matchingFrequencies(word, data).map((row) => row.rank),
            );
      if (Number.isFinite(rank)) ranks.set(word.id, rank);
      else if (settings.missingFrequency === "random") {
        // A hash keeps each random rank stable across queue reloads and exports.
        const hash = new DataView(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(word.id),
          ),
        ).getUint32(0);
        ranks.set(
          word.id,
          1 + (hash / 2 ** 32) * Math.max(0, maxFrequency - 1),
        );
      }
    }),
  );
  return words.sort(
    (a, b) =>
      (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) ||
      a.created - b.created ||
      a.id.localeCompare(b.id),
  );
}

export function isRankSource(
  dictionary: Dictionary,
  settings: Pick<Settings, "rankSources">,
) {
  return (
    settings.rankSources[dictionary.id] ??
    /^Leipzig[. ].*Rank/i.test(dictionary.index.title)
  );
}
