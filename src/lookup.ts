import { db } from "./db";
import { analyzeWords } from "./morphology";
import { parsingCandidates, type ParsingCandidate } from "./parsing-rules";
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

async function dictionaryLookup(
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
  const fallbacks = new Map<string, ParsingCandidate[]>();
  let frontier = missing;
  while (frontier.length) {
    const refs = new Set<string>();
    const analyses = await analyzeWords(
      frontier.filter((term) => !graph.get(term)?.length),
      language,
    );
    for (const term of frontier) {
      const rows = graph.get(term) || [];
      if (!rows.length) {
        const lemma = analyses.get(term);
        const candidates: ParsingCandidate[] = [
          ...(lemma ? [{ term: lemma, forms: [] }] : []),
          ...parsingCandidates(term, language),
        ];
        fallbacks.set(term, candidates);
        for (const candidate of candidates)
          if (!graph.has(candidate.term)) refs.add(candidate.term);
      }
      for (const entry of rows) {
        for (const definition of entry.definitions)
          if (Array.isArray(definition) && definition[0]) {
            const target = normalize(definition[0]);
            if (!graph.has(target)) refs.add(target);
          }
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
    const prefixWords = new Map<string, LookupWord>();
    const unresolved = new Set<string>();
    const visited = new Set<string>();
    const visitedEntries = new Set<string>();
    const todo = [
      { term, forms: [] as string[], verbOnly: false, perfectiveOnly: false },
    ];
    while (todo.length) {
      const current = todo.pop()!;
      const visitKey = JSON.stringify([
        current.term,
        current.verbOnly,
        current.perfectiveOnly,
      ]);
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);
      const rows = graph.get(current.term) || [];
      if (!rows.length) {
        const candidates = fallbacks.get(current.term) || [];
        if (!candidates.length) unresolved.add(current.term);
        for (const candidate of candidates)
          todo.push({
            term: candidate.term,
            forms: [...current.forms, ...candidate.forms],
            verbOnly: current.verbOnly || !!candidate.verbOnly,
            perfectiveOnly:
              current.perfectiveOnly || !!candidate.perfectiveOnly,
          });
        continue;
      }
      for (const entry of rows) {
        const entryKey = JSON.stringify([
          entry.id,
          current.verbOnly,
          current.perfectiveOnly,
        ]);
        if (visitedEntries.has(entryKey)) continue;
        visitedEntries.add(entryKey);
        const dictionary = dictionaryByRevision.get(entry.revisionId)!;
        const definitions = entry.definitions.filter((d) => !Array.isArray(d));
        if (
          definitions.length &&
          (!current.verbOnly ||
            /(?:^|\s)(?:v|verb)(?:\s|$)/i.test(entry.tags)) &&
          (!current.perfectiveOnly || /(?:^|\s)pf(?:\s|$)/i.test(entry.tags))
        ) {
          const resolved = current.verbOnly ? prefixWords : words;
          const id = wordId(language, entry.key, entry.reading);
          const word = resolved.get(id) || {
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
          resolved.set(id, word);
        }
        for (const definition of entry.definitions)
          if (Array.isArray(definition) && definition[0]) {
            const target = normalize(definition[0]);
            todo.push({
              term: target,
              forms: [...current.forms, ...definition[1]],
              verbOnly: current.verbOnly,
              perfectiveOnly: current.perfectiveOnly,
            });
          }
      }
    }
    const resolved = words.size ? words : prefixWords;
    for (const word of resolved.values())
      word.meanings.sort(
        (a, b) =>
          dictionaryPriority.get(a.dictionaryId)! -
          dictionaryPriority.get(b.dictionaryId)!,
      );
    const value = {
      words: [...resolved.values()].sort(
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

export async function lookupMany(
  terms: string[],
  language: string,
): Promise<Map<string, LookupResult>> {
  const results = await dictionaryLookup(terms, language);
  const lemmas = [
    ...new Set([
      ...terms.flatMap((term) => [normalize(term), folded(term, language)]),
      ...[...results.values()].flatMap((result) =>
        result.words.map((word) => word.lemma),
      ),
    ]),
  ];
  const personal = await db.vocabulary
    .where("lemma")
    .anyOf(lemmas)
    .filter(
      (word) =>
        word.language === language &&
        word.meanings.some((meaning) => meaning.dictionaryId === "personal"),
    )
    .toArray();
  const byId = new Map(personal.map((word) => [word.id, word]));
  for (const term of terms.map(normalize)) {
    const result = results.get(term) || { words: [], unresolved: [] };
    const words = result.words.map((word) => {
      const saved = byId.get(word.id);
      return saved
        ? {
            ...word,
            meanings: [
              ...saved.meanings.filter(
                (meaning) => meaning.dictionaryId === "personal",
              ),
              ...word.meanings,
            ],
          }
        : word;
    });
    for (const word of personal) {
      if (
        folded(word.lemma, language) !== folded(term, language) ||
        words.some((candidate) => candidate.id === word.id)
      )
        continue;
      words.unshift({ ...word, forms: [] });
    }
    results.set(term, {
      words,
      unresolved: words.length ? [] : result.unresolved,
    });
  }
  return results;
}

export type ScanSpan = {
  start: number;
  end: number;
  term: string;
  ids: string[];
  candidates: { id: string; tags: string[]; state: WordState }[];
  state: WordState | "ignored";
};
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function scanText(
  text: string,
  language: string,
  matureIntervalDays: number,
): Promise<ScanSpan[]> {
  const dictionaries = await activeDictionaries(language);
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
    const state = stateOf(vocabulary.get(words[0]!.id), matureIntervalDays);
    spans.push({
      ...candidate,
      ids: words.map((w) => w.id),
      candidates: words.map((word) => ({
        id: word.id,
        tags: word.meanings.flatMap((meaning) => meaning.tags.split(/\s+/u)),
        state: stateOf(vocabulary.get(word.id), matureIntervalDays),
      })),
      state,
    });
    end = candidate.end;
  }
  return spans;
}
