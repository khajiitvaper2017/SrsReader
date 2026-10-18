import { db } from "./db";
import {
  folded,
  normalize,
  type Frequency,
  type Settings,
  type Vocabulary,
} from "./model";

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
      const matching = (
        byKey.get(folded(word.lemma, word.language)) || []
      ).filter(
        (row) =>
          row.reading === null || row.reading === normalize(word.reading),
      );
      const exact = matching.filter((row) => row.key === normalize(word.lemma));
      const candidates = exact.length ? exact : matching;
      const reading = candidates.filter((row) => row.reading !== null);
      const rank = (reading.length ? reading : candidates).reduce(
        (min, row) => Math.min(min, row.rank),
        Infinity,
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
