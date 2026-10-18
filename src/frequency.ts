import { db } from "./db";
import {
  folded,
  normalize,
  type Frequency,
  type LookupWord,
  type Settings,
  type Vocabulary,
} from "./model";

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

export async function wordFrequencies(
  word: Pick<LookupWord, "lemma" | "reading" | "language">,
) {
  const dictionaries = (
    await db.dictionaries.orderBy("order").toArray()
  ).filter(
    (d) => d.enabled && d.language === word.language && d.frequencyCount > 0,
  );
  if (!dictionaries.length) return [];
  const rows = await db.frequencies
    .where("[revisionId+folded]")
    .anyOf(
      dictionaries.map((d) => [
        d.revisionId,
        folded(word.lemma, word.language),
      ]),
    )
    .toArray();
  return dictionaries.flatMap((dictionary) => {
    const rank = frequencyRank(
      rows.filter((row) => row.revisionId === dictionary.revisionId),
      word.lemma,
      word.reading,
    );
    return Number.isFinite(rank)
      ? [{ title: dictionary.index.title, rank }]
      : [];
  });
}

export async function orderNewWords(words: Vocabulary[], settings: Settings) {
  const dictionary = (await db.dictionaries.orderBy("order").toArray()).find(
    (d) =>
      d.enabled && d.language === settings.language && d.frequencyCount > 0,
  );
  const rows = dictionary
    ? await db.frequencies
        .where("[revisionId+folded]")
        .anyOf(
          [...new Set(words.map((w) => folded(w.lemma, w.language)))].map(
            (key) => [dictionary.revisionId, key],
          ),
        )
        .toArray()
    : [];
  const byKey = new Map<string, Frequency[]>();
  for (const row of rows) {
    const group = byKey.get(row.folded) || [];
    group.push(row);
    byKey.set(row.folded, group);
  }
  const ranks = new Map<string, number>();
  await Promise.all(
    words.map(async (word) => {
      const rank = frequencyRank(
        byKey.get(folded(word.lemma, word.language)) || [],
        word.lemma,
        word.reading,
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
          1 +
            (hash / 2 ** 32) *
              Math.max(0, (dictionary?.maxFrequency ?? words.length) - 1),
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
