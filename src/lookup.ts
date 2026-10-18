import { db } from "./db";
import { analyzeWords } from "./morphology";
import {
  folded,
  normalize,
  stateOf,
  wordId,
  type Dictionary,
  type Entry,
  type LookupResult,
  type LookupWord,
  type WordState,
} from "./model";

const cache = new Map<string, LookupResult>();
export function clearLookupCache() {
  cache.clear();
}
export async function activeDictionaries(language: string) {
  return (await db.dictionaries.orderBy("order").toArray()).filter(
    (d) => d.enabled && d.language === language && d.count > 0,
  );
}

async function fetchTerms(
  terms: string[],
  dictionaries: Dictionary[],
  language: string,
) {
  const keys = [...new Set(terms.map((t) => folded(t, language)))];
  const entries = await db.entries
    .where("[revisionId+folded]")
    .anyOf(dictionaries.flatMap((d) => keys.map((k) => [d.revisionId, k])))
    .toArray();
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.folded) || [];
    group.push(entry);
    groups.set(entry.folded, group);
  }
  return new Map(
    terms.map((term) => [
      normalize(term),
      groups.get(folded(term, language)) || [],
    ]),
  );
}

export async function lookupMany(
  terms: string[],
  language: string,
): Promise<Map<string, LookupResult>> {
  const dictionaries = await activeDictionaries(language);
  const results = new Map<string, LookupResult>();
  const missing = [...new Set(terms.map(normalize))].filter((term) => {
    const hit = cache.get(JSON.stringify([language, term]));
    if (hit) {
      results.set(term, hit);
      return false;
    }
    return true;
  });
  if (!missing.length || !dictionaries.length) return results;
  const graph = await fetchTerms(missing, dictionaries, language);
  const analyses = await analyzeWords(
    missing.filter((term) => !graph.get(term)?.length),
    language,
  );
  const lemmas = [...new Set(analyses.values())];
  if (lemmas.length)
    for (const [key, value] of await fetchTerms(lemmas, dictionaries, language))
      graph.set(key, value);
  let frontier = [...missing, ...lemmas];
  while (frontier.length) {
    const refs = new Set<string>();
    for (const term of frontier)
      for (const entry of graph.get(term) || []) {
        for (const definition of entry.definitions)
          if (Array.isArray(definition) && definition[0]) {
            const target = normalize(definition[0]);
            if (!graph.has(target)) refs.add(target);
          }
      }
    frontier = [...refs];
    if (frontier.length)
      for (const [key, value] of await fetchTerms(
        frontier,
        dictionaries,
        language,
      ))
        graph.set(key, value);
  }
  const dictionaryByRevision = new Map(
    dictionaries.map((d) => [d.revisionId, d]),
  );
  const dictionaryPriority = new Map(dictionaries.map((d, i) => [d.id, i]));
  for (const term of missing) {
    const words = new Map<string, LookupWord>();
    const unresolved = new Set<string>();
    const visited = new Set<string>();
    const visitedEntries = new Set<string>();
    const todo = [{ term: analyses.get(term) || term, forms: [] as string[] }];
    while (todo.length) {
      const current = todo.pop()!;
      if (visited.has(current.term)) continue;
      visited.add(current.term);
      const rows = graph.get(current.term) || [];
      if (!rows.length) {
        unresolved.add(current.term);
        continue;
      }
      for (const entry of rows) {
        if (visitedEntries.has(entry.id)) continue;
        visitedEntries.add(entry.id);
        const dictionary = dictionaryByRevision.get(entry.revisionId)!;
        const definitions = entry.definitions.filter((d) => !Array.isArray(d));
        if (definitions.length) {
          const id = wordId(language, entry.key, entry.reading);
          const word = words.get(id) || {
            id,
            lemma: entry.key,
            reading: entry.reading,
            language,
            meanings: [],
            forms: current.forms,
          };
          word.meanings.push({
            dictionaryId: dictionary.id,
            title: dictionary.index.title,
            revision: dictionary.index.revision,
            attribution:
              dictionary.index.attribution || dictionary.index.author || "",
            sourceUrl: dictionary.index.url || "",
            tags: entry.tags,
            definitions,
          });
          words.set(id, word);
        }
        for (const definition of entry.definitions)
          if (Array.isArray(definition) && definition[0]) {
            todo.push({
              term: normalize(definition[0]),
              forms: [...current.forms, ...definition[1]],
            });
          }
      }
    }
    for (const word of words.values())
      word.meanings.sort(
        (a, b) =>
          dictionaryPriority.get(a.dictionaryId)! -
          dictionaryPriority.get(b.dictionaryId)!,
      );
    const value = {
      words: [...words.values()].sort(
        (a, b) =>
          Number(a.lemma !== folded(a.lemma, language)) -
            Number(b.lemma !== folded(b.lemma, language)) ||
          Number(b.lemma === folded(term, language)) -
            Number(a.lemma === folded(term, language)) ||
          Number(b.lemma === term) - Number(a.lemma === term),
      ),
      unresolved: [...unresolved],
    };
    results.set(term, value);
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(JSON.stringify([language, term]), value);
  }
  return results;
}

export type ScanSpan = {
  start: number;
  end: number;
  term: string;
  ids: string[];
  state: WordState;
};
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function scanText(
  text: string,
  language: string,
): Promise<ScanSpan[]> {
  const dictionaries = await activeDictionaries(language);
  if (!dictionaries.length) return [];
  const segments = [
    ...new Intl.Segmenter(language, { granularity: "word" }).segment(text),
  ].filter((s) => s.isWordLike);
  const firsts = [...new Set(segments.map((s) => folded(s.segment, language)))];
  const phrases = await db.phrases
    .where("[revisionId+first]")
    .anyOf(dictionaries.flatMap((d) => firsts.map((f) => [d.revisionId, f])))
    .toArray();
  const byFirst = new Map<string, string[]>();
  for (const phrase of phrases) {
    const list = byFirst.get(phrase.first) || [];
    if (!list.includes(phrase.text)) list.push(phrase.text);
    byFirst.set(phrase.first, list);
  }
  const candidates: { start: number; end: number; term: string }[] = [];
  for (const segment of segments) {
    candidates.push({
      start: segment.index,
      end: segment.index + segment.segment.length,
      term: segment.segment,
    });
    for (const phrase of byFirst.get(folded(segment.segment, language)) || []) {
      const match = new RegExp(
        `^${escapeRegex(phrase).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{M}\\p{N}])`,
        "u",
      ).exec(folded(text.slice(segment.index), language));
      if (match)
        candidates.push({
          start: segment.index,
          end: segment.index + match[0].length,
          term: phrase,
        });
    }
  }
  const matches = await lookupMany(
    candidates.map((c) => c.term),
    language,
  );
  const ids = [
    ...new Set([...matches.values()].flatMap((m) => m.words.map((w) => w.id))),
  ];
  const vocabulary = new Map(
    (await db.vocabulary.bulkGet(ids))
      .filter((v) => v !== undefined)
      .map((v) => [v.id, v]),
  );
  const spans: ScanSpan[] = [];
  let end = -1;
  for (const candidate of candidates.sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )) {
    if (candidate.start < end) continue;
    const words = matches.get(normalize(candidate.term))?.words || [];
    if (!words.length) continue;
    const state = stateOf(vocabulary.get(words[0]!.id));
    spans.push({ ...candidate, ids: words.map((w) => w.id), state });
    end = candidate.end;
  }
  return spans;
}
