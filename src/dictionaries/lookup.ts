import type {
  Dictionary,
  Entry,
  EntryMatch,
  LookupResult,
  LookupWord,
  Phrase,
} from "@/dictionaries/model";
import { meaningTags } from "@/dictionaries/model";
import { nechybujteCacheKey } from "@/dictionaries/nechybujte";
import { isOnlineDictionary, mergeOnline } from "@/dictionaries/online";
import { spanishDictCacheKey } from "@/dictionaries/spanishdict";
import { analyzeWords } from "@/languages/morphology";
import {
  parsingCandidates,
  type ParsingCandidate,
} from "@/languages/parsing-rules";
import {
  folded,
  germanHyphenatedCompounds,
  hasGermanSuspensionHyphen,
  joinedGermanCompound,
  normalize,
  swissGermanSpelling,
} from "@/languages/text";
import { db } from "@/platform/database/db";
import { wordId } from "@/vocabulary/model";
import { getSettings } from "@/settings/store";
import { listDictionaries } from "@/dictionaries/storage";
import { displayedMeanings } from "@/dictionaries/display";
import { applyDefinitionOverrides, meaningKey } from "@/vocabulary/definitions";

type LookupEntry = Omit<Entry, "sequence"> & { defined: boolean };

function isLookupReference(
  entry: LookupEntry,
  definition: Entry["definitions"][number],
  rows: LookupEntry[],
): definition is [string, string[]] {
  if (!Array.isArray(definition) || !definition[0]) return false;
  // A defined single-word headword must not expand into unrelated phrase variants.
  return !(
    /\s/u.test(definition[0]) &&
    definition[1].includes("variant") &&
    !/\s/u.test(entry.key) &&
    rows.some(
      (candidate) =>
        candidate.defined &&
        candidate.revisionId === entry.revisionId &&
        candidate.key === entry.key &&
        candidate.reading === entry.reading,
    )
  );
}

let lookupCache = new Map<string, LookupResult>();
// Prefix probes should not evict ordinary word lookups.
let compoundCache = new Map<string, LookupResult>();
let phraseCache = { size: 0, rowsByKey: new Map<string, Phrase[]>() };
const phraseCacheLimit = 50_000;

export function clearLookupCache() {
  lookupCache = new Map();
  compoundCache = new Map();
  phraseCache = { size: 0, rowsByKey: new Map() };
}
export async function activeDictionaries(language: string) {
  return (await db.dictionaries.orderBy("order").toArray()).filter(
    (d) => d.enabled && d.language === language && d.count > 0,
  );
}

export async function lookupPhrases(revisions: string[], firstWords: string[]) {
  const current = phraseCache;
  const keys = revisions
    .flatMap((revision) => firstWords.map((word) => [revision, word]))
    .sort((a, b) => indexedDB.cmp(a, b));
  const rows: Phrase[][] = [];
  const misses = keys.flatMap((key, index) => {
    const id = JSON.stringify(key);
    const cached = current.rowsByKey.get(id);
    if (!cached) return [{ id, key, index }];
    current.rowsByKey.delete(id);
    current.rowsByKey.set(id, cached);
    rows[index] = cached;
    return [];
  });
  let databaseRows = 0;
  if (misses.length) {
    const loaded = await db.transaction("r", db.phrases, () =>
      Promise.all(
        misses.map(({ key }) =>
          db.phrases.where("[revisionId+first]").equals(key).toArray(),
        ),
      ),
    );
    for (const [index, { id, index: position }] of misses.entries()) {
      const phrases = loaded[index]!;
      rows[position] = phrases;
      databaseRows += phrases.length;
      const size = phrases.length + 1;
      if (size > phraseCacheLimit || current.rowsByKey.has(id)) continue;
      while (current.size + size > phraseCacheLimit) {
        const [oldest, evicted] = current.rowsByKey.entries().next().value!;
        current.rowsByKey.delete(oldest);
        current.size -= evicted.length + 1;
      }
      current.rowsByKey.set(id, phrases);
      current.size += size;
    }
  }
  return { phrases: rows.flat(), databaseRows };
}

async function fetchTerms(
  terms: string[],
  dictionaries: Dictionary[],
  language: string,
  withDefinitions: boolean,
) {
  const keys = [...new Set(terms.map((t) => folded(t, language)))];
  const table = withDefinitions ? db.entries : db.entryMatches;
  const indexKeys = dictionaries
    .flatMap((dictionary) => keys.map((key) => [dictionary.revisionId, key]))
    .sort((a, b) => indexedDB.cmp(a, b));
  const rows = (
    await db.transaction("r", table, () =>
      Promise.all(
        indexKeys.map((key) =>
          table.where("[revisionId+folded]").equals(key).toArray(),
        ),
      ),
    )
  ).flat();
  const entries: LookupEntry[] = rows.map((entry) => ({
    ...entry,
    defined: withDefinitions
      ? entry.definitions.some((definition) => !Array.isArray(definition))
      : (entry as EntryMatch).defined,
  }));
  const groups = new Map<string, LookupEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.folded) || [];
    group.push(entry);
    groups.set(entry.folded, group);
  }
  return new Map(
    terms.map((term) => {
      const key = normalize(term);
      const rows = groups.get(folded(key, language)) || [];
      if (language === "de") {
        const exact = rows.filter((entry) => entry.key === key);
        if (exact.length) return [key, exact];
      }
      return [key, rows];
    }),
  );
}

export type DictionaryLookupTiming = {
  entryQueryMs: number;
  entryQueries: number;
  savedWordQueryMs: number;
};

async function dictionaryLookup(
  terms: string[],
  language: string,
  localAnalysis: boolean,
  withDefinitions: boolean,
  timing: DictionaryLookupTiming | undefined,
  cache: Map<string, LookupResult>,
): Promise<Map<string, LookupResult>> {
  const results = new Map<string, LookupResult>();
  const missing = [...new Set(terms.map(normalize))].filter((term) => {
    const hit = cache.get(
      JSON.stringify([language, term, localAnalysis, withDefinitions]),
    );
    if (hit) {
      results.set(term, hit);
      return false;
    }
    return true;
  });
  if (!missing.length) return results;
  const dictionaries = await activeDictionaries(language);
  if (!dictionaries.length) return results;
  async function readEntries(terms: string[]) {
    const started = performance.now();
    const entries = await fetchTerms(
      terms,
      dictionaries,
      language,
      withDefinitions,
    );
    if (timing) {
      timing.entryQueryMs += performance.now() - started;
      timing.entryQueries++;
    }
    return entries;
  }
  const graph = await readEntries(missing);
  const fallbacks = new Map<string, ParsingCandidate[]>();
  let frontier = missing;
  while (frontier.length) {
    const refs = new Set<string>();
    const analyses = localAnalysis
      ? await analyzeWords(
          frontier.filter((term) => !graph.get(term)?.length),
          language,
        )
      : new Map<string, string>();
    for (const term of frontier) {
      const rows = graph.get(term) || [];
      if (!rows.length) {
        const lemma = analyses.get(term);
        const candidates: ParsingCandidate[] = [
          ...(lemma ? [{ term: lemma, forms: [] }] : []),
          ...(localAnalysis ? parsingCandidates(term, language) : []),
        ];
        fallbacks.set(term, candidates);
        for (const candidate of candidates)
          if (!graph.has(candidate.term)) refs.add(candidate.term);
      }
      for (const entry of rows) {
        for (const definition of entry.definitions)
          if (isLookupReference(entry, definition, rows)) {
            const target = normalize(definition[0]);
            if (!graph.has(target)) refs.add(target);
          }
      }
    }
    frontier = [...refs];
    if (frontier.length)
      for (const [key, value] of await readEntries(frontier))
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
        const definitions = entry.definitions.flatMap((definition) =>
          !Array.isArray(definition)
            ? [definition]
            : isLookupReference(entry, definition, rows) &&
                !rows.some(
                  (candidate) =>
                    candidate.defined &&
                    candidate.key === entry.key &&
                    candidate.reading === entry.reading,
                ) &&
                !graph.get(normalize(definition[0]))?.length
              ? [
                  [definition[1].join(", "), definition[0]]
                    .filter(Boolean)
                    .join(": "),
                ]
              : [],
        );
        if (
          (entry.defined || definitions.length) &&
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
          if (isLookupReference(entry, definition, rows)) {
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
      words: [...resolved.values()].sort((a, b) => {
        const exact = Number(b.lemma === term) - Number(a.lemma === term);
        if (language === "de") return exact;
        return (
          Number(a.lemma !== folded(a.lemma, language)) -
            Number(b.lemma !== folded(b.lemma, language)) ||
          Number(b.lemma === folded(term, language)) -
            Number(a.lemma === folded(term, language)) ||
          exact
        );
      }),
      unresolved: [...unresolved],
    };
    results.set(term, value);
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(
      JSON.stringify([language, term, localAnalysis, withDefinitions]),
      value,
    );
  }
  return results;
}

export async function lookupMany(
  terms: string[],
  language: string,
  localAnalysis = true,
  withDefinitions = true,
  timing?: DictionaryLookupTiming,
  cache = lookupCache,
): Promise<Map<string, LookupResult>> {
  const joined = new Map<string, string>();
  if (language === "de")
    for (const term of terms) {
      const alternative = joinedGermanCompound(term);
      if (alternative) joined.set(normalize(term), alternative);
    }
  const requested = terms;
  if (joined.size)
    terms = [...new Set([...terms.map(normalize), ...joined.values()])];
  const settings = await getSettings();
  const [ordered, results] = await Promise.all([
    listDictionaries(settings),
    dictionaryLookup(
      terms,
      language,
      localAnalysis,
      withDefinitions,
      timing,
      cache,
    ),
  ]);
  const lemmas = [
    ...new Set([
      ...terms.flatMap((term) => [normalize(term), folded(term, language)]),
      ...[...results.values()].flatMap((result) =>
        result.words.map((word) => word.lemma),
      ),
    ]),
  ];
  const savedQueryStarted = performance.now();
  const savedEntries = await db.vocabulary
    .where("lemma")
    .anyOf(lemmas)
    .filter((word) => word.language === language)
    .toArray();
  const linkedWords = new Set(
    savedEntries.length
      ? await db.notes
          .where("wordId")
          .anyOf(savedEntries.map((word) => word.id))
          .uniqueKeys()
      : [],
  );
  if (timing) timing.savedWordQueryMs += performance.now() - savedQueryStarted;
  const byId = new Map(savedEntries.map((word) => [word.id, word]));
  const byLemma = new Map<string, typeof savedEntries>();
  for (const word of savedEntries) {
    const key = folded(word.lemma, language);
    const group = byLemma.get(key) || [];
    group.push(word);
    byLemma.set(key, group);
  }
  for (const term of terms.map(normalize)) {
    const result = results.get(term) || { words: [], unresolved: [] };
    const words = result.words.map((word) => {
      const saved = byId.get(word.id);
      return saved
        ? {
            ...word,
            meanings: [
              ...saved.meanings.filter(
                (meaning) =>
                  meaning.dictionaryId === "personal" ||
                  isOnlineDictionary(meaning.dictionaryId),
              ),
              ...word.meanings,
            ],
          }
        : word;
    });
    for (const word of byLemma.get(folded(term, language)) || []) {
      if (words.some((candidate) => candidate.id === word.id)) continue;
      const meanings = word.meanings.filter(
        (meaning) =>
          meaning.dictionaryId === "personal" ||
          isOnlineDictionary(meaning.dictionaryId) ||
          !!word.definitionOverrides?.[meaningKey(meaning)],
      );
      if (meanings.length || linkedWords.has(word.id))
        words.unshift({ ...word, meanings, forms: [] });
    }
    results.set(term, {
      words,
      unresolved: words.length ? [] : result.unresolved,
    });
  }
  if (language === "cs" || language === "es") {
    const keys = terms.map(
      language === "cs" ? nechybujteCacheKey : spanishDictCacheKey,
    );
    const stored = await (
      language === "cs" ? db.nechybujte : db.spanishdict
    ).bulkGet(keys);
    for (const [index, record] of stored.entries())
      if (record) {
        const term = normalize(terms[index]!);
        results.set(term, mergeOnline(results.get(term)!, record.result, term));
      }
  }
  for (const result of results.values())
    result.words = result.words.flatMap((word) => {
      const meanings = displayedMeanings(
        applyDefinitionOverrides(word.meanings, byId.get(word.id)),
        settings,
        ordered,
      );
      return meanings.length || linkedWords.has(word.id)
        ? [{ ...word, meanings }]
        : [];
    });
  for (const [term, alternative] of joined) {
    if (results.get(term)!.words.length) continue;
    const words = results
      .get(alternative)!
      .words.filter(
        (word) =>
          word.meanings.length &&
          folded(word.lemma, language) === folded(alternative, language),
      );
    if (words.length) results.set(term, { words, unresolved: [] });
  }
  return joined.size
    ? new Map(
        requested.map((term) => [
          normalize(term),
          results.get(normalize(term))!,
        ]),
      )
    : results;
}

type GermanCompoundPart = { term: string; start: number; end: number };
type GermanCompoundMatch = {
  lemma?: string;
  inflectedHead?: string;
  pluralStem?: string;
  adjective?: string;
  modifier?: string;
  affix?: string;
  stem?: string;
  verb?: string;
};

function* splitGermanCompound(
  term: string,
  lemmas: Map<string, GermanCompoundMatch>,
): Generator<string[], GermanCompoundPart[]> {
  if (
    !/^[\p{L}\p{M}]+$/u.test(term) &&
    germanHyphenatedCompounds(term).next().value?.[0] !== term
  )
    return [];
  const letters = [...term.matchAll(/[\p{L}\p{M}]/gu)];
  if (letters.length < 4 || letters.length > 60) return [];
  const word = letters.map(([letter]) => letter);
  const suspended = hasGermanSuspensionHyphen(term);
  const startsAt = letters.map(({ index }) =>
    term[index - 1] === "[" ? index - 1 : index,
  );
  const endsAt = letters.map(({ 0: letter, index }) => {
    const end = index + letter.length;
    return term[end] === "]" ? end + 1 : end;
  });
  const hyphens = startsAt.flatMap((start, index) =>
    /[-‐‑]/u.test(term[start - 1] ?? "") ? [index] : [],
  );
  // Short fragments can be syllable breaks, as in don-au.
  const preferred = new Set(
    hyphens.filter(
      (index, i) =>
        index - (hyphens[i - 1] ?? 0) >= 3 &&
        (hyphens[i + 1] ?? word.length) - index >= 3,
    ),
  );
  const boundaryCount = [0];
  for (let index = 0; index < word.length; index++)
    boundaryCount.push(boundaryCount[index]! + Number(preferred.has(index)));
  const partCost = word.length + 1;
  const crossingCost = partCost ** 2;

  const noun = (letters: string[]) =>
    letters[0]!.toLocaleUpperCase("de") + letters.slice(1).join("");
  type Edge = {
    part: string;
    end: number;
    linked?: boolean;
    adjective?: boolean;
    affix?: boolean;
    caseFallback?: boolean;
  };
  const edges: Edge[][] = Array.from({ length: word.length }, () => []);
  function addEdges(start: number, end: number, limit: number) {
    const part = normalize(noun(word.slice(start, end)));
    const caseFallback =
      (start === 0 ||
        preferred.has(start) ||
        (!hyphens.length &&
          end === word.length &&
          /^\p{Ll}$/u.test(word[0]!))) &&
      (end === word.length || preferred.has(end)) &&
      /^\p{Ll}$/u.test(word[start]!);
    const choices: Edge[] = [{ part, end, caseFallback }];
    if (start > 0)
      choices.push({
        part: "-" + folded(word.slice(start, end).join(""), "de"),
        end,
        affix: true,
      });
    edges[start]!.push(...choices);
    if (end < word.length)
      edges[start]!.push({
        part: folded(word.slice(start, end).join(""), "de"),
        end,
        adjective: true,
        caseFallback: true,
      });
    for (const linker of ["s", "es", "n", "en"]) {
      const next = end + linker.length;
      if (next <= limit && word.slice(end, next).join("") === linker)
        edges[start]!.push(
          ...choices.map((choice) => ({ ...choice, end: next, linked: true })),
        );
    }
  }
  for (let split = 2; split <= word.length - 2; split++) {
    addEdges(0, split, word.length - 2);
    addEdges(split, word.length, word.length);
    edges[0]!.push({
      part: folded(word.slice(0, split).join(""), "de") + "-",
      end: split,
      affix: true,
    });
    if (suspended)
      for (const linker of ["s", "es", "n", "en"]) {
        const end = word.length - linker.length;
        if (end > split && word.slice(end).join("") === linker)
          addEdges(split, end, word.length);
      }
    if (
      !hyphens.length &&
      /^\p{Ll}$/u.test(word[0]!) &&
      /^\p{Ll}$/u.test(word[split]!)
    )
      edges[split]!.push({
        part: normalize(word.slice(split).join("")),
        end: word.length,
        adjective: true,
      });
  }

  // Explicitly separated lowercase adjectives keep their spelling and may be inflected.
  if (hyphens.length) {
    let chunkStart = 0;
    for (const end of [...hyphens, word.length]) {
      if (end - chunkStart >= 3 && /^\p{Ll}$/u.test(word[chunkStart]!))
        edges[chunkStart]!.push({
          part: normalize(word.slice(chunkStart, end).join("")),
          end,
          adjective: true,
        });
      chunkStart = end;
    }
  }

  // A suspended stem may be a single noun, with a linking ending before the dash.
  if (suspended) {
    for (let end = word.length - 2; end <= word.length; end++)
      addEdges(0, end, word.length);
  }

  // Two-part compounds need only prefix and suffix lookups.
  const starts = edges[0]!;
  yield edges.flatMap((choices) => choices.map(({ part }) => part));

  function bestSplit() {
    const best: (
      { score: number; paths: GermanCompoundPart[][] } | undefined
    )[] = [{ score: 0, paths: [[]] }];
    for (const [start, choices] of edges.entries()) {
      const prefix = best[start];
      if (!prefix) continue;
      for (const {
        part,
        end,
        linked,
        adjective,
        affix,
        caseFallback,
      } of choices) {
        const match = lemmas.get(part);
        const inflectedHead =
          end === word.length ? match?.inflectedHead : undefined;
        const lemma = affix
          ? match?.affix
          : adjective
            ? end < word.length
              ? match?.modifier
              : match?.adjective
            : ((end < word.length ? match?.pluralStem : undefined) ??
              match?.lemma ??
              (end < word.length ? match?.stem : match?.verb) ??
              inflectedHead);
        if (!lemma) continue;
        const crossed = boundaryCount[end]! - boundaryCount[start + 1]!;
        const score =
          prefix.score +
          crossed * crossingCost +
          partCost +
          Number(
            linked ||
              (!adjective &&
                !affix &&
                !match?.lemma &&
                lemma !== match?.pluralStem),
          ) +
          Number(lemma === match?.stem) +
          Number(affix === true && part.startsWith("-")) * 2 +
          Number(!affix && !!lemmas.get(folded(part, "de") + "-")?.affix) +
          Number(
            caseFallback === true &&
              (!adjective || !!lemmas.get(noun(word.slice(start, end)))?.lemma),
          );
        let target = best[end];
        if (!target || score < target.score) {
          target = { score, paths: [] };
          best[end] = target;
        }
        if (score !== target.score) continue;
        for (const path of prefix.paths) {
          const next = [
            ...path,
            {
              term: lemma,
              start: startsAt[start]!,
              end: endsAt[end - 1]!,
            },
          ];
          const previous = target.paths[0];
          if (previous) {
            const boundary = next.findIndex(
              (part, index) => part.end !== previous[index]?.end,
            );
            if (boundary >= 0) {
              // shortcut: boundary ties favor longer left parts; use context to resolve semantic ambiguity.
              if (next[boundary]!.end < previous[boundary]!.end) continue;
              target.paths = [];
            }
          }
          if (target.paths.length === 2) continue;
          if (
            !target.paths.some((other) =>
              next.every(
                (part, i) =>
                  part.term === other[i]?.term && part.end === other[i]?.end,
              ),
            )
          )
            target.paths.push(next);
          if (target.paths.length === 2) break;
        }
      }
    }
    return best[word.length];
  }

  const pairs = bestSplit();
  if (pairs && pairs.score < crossingCost)
    return pairs.paths.length === 1 ? pairs.paths[0]! : [];
  const firstInterior = Math.min(
    ...starts
      .filter(({ part, adjective, affix }) =>
        affix
          ? lemmas.get(part)?.affix
          : adjective
            ? lemmas.get(part)?.modifier
            : lemmas.get(part)?.lemma || lemmas.get(part)?.stem,
      )
      .map(({ end }) => end),
  );
  const lastInterior = edges.findLastIndex((choices) =>
    choices.some(({ end, part, adjective }) => {
      const match = lemmas.get(part);
      return (
        end === word.length &&
        (adjective
          ? match?.adjective
          : match?.lemma || match?.verb || match?.inflectedHead)
      );
    }),
  );
  if (firstInterior + 2 > lastInterior)
    return pairs?.paths.length === 1 ? pairs.paths[0]! : [];

  for (let start = firstInterior; start + 2 <= lastInterior; start++) {
    for (let end = start + 2; end <= lastInterior; end++)
      addEdges(start, end, lastInterior);
  }
  yield edges.flatMap((choices) => choices.map(({ part }) => part));
  const paths = bestSplit()?.paths ?? [];
  return paths.length === 1 ? paths[0]! : [];
}

export async function lookupGermanCompounds(
  terms: string[],
  timing?: DictionaryLookupTiming,
) {
  const lemmas = new Map<string, GermanCompoundMatch>();
  async function readLemmas(parts: string[]) {
    const missing = [...new Set(parts)].filter((part) => !lemmas.has(part));
    if (!missing.length) return;
    const stems = new Map(
      missing.map((part) => [
        part,
        /^\p{Lu}[\p{L}\p{M}]+$/u.test(part)
          ? [part + "e", folded(part, "de") + "en", folded(part, "de") + "n"]
          : [],
      ]),
    );
    const matches = await lookupMany(
      [...new Set([...missing, ...[...stems.values()].flat()])],
      "de",
      false,
      false,
      timing,
      compoundCache,
    );
    for (const part of missing) {
      const words = matches.get(part)?.words ?? [];
      const match =
        words.find((word) => word.lemma === part && word.meanings.length) ??
        words.find(
          (word) =>
            word.meanings.length &&
            swissGermanSpelling(word.lemma) === swissGermanSpelling(part),
        );
      // Every redirect must describe an inflection, not a chain of name variants.
      const inflectedHeads = new Set(
        words
          .filter(
            (word) =>
              word.meanings.length &&
              word.forms.length &&
              word.forms.every((form) =>
                /^(?:(?:genitiv|genitive) singular|(?:(?:nominativ|genitiv|dativ|akkusativ|accusativ)e?[/ ])*plural(?: (?:in)?definite)?)$/iu.test(
                  form,
                ),
              ),
          )
          .map((word) => word.lemma),
      );
      const adjectives = new Set(
        /^\p{Ll}/u.test(part)
          ? words
              .filter(
                (word) =>
                  (word.lemma === part || word.forms.length > 0) &&
                  (word.meanings.some((meaning) =>
                    meaningTags(meaning).some((tag) =>
                      /^(?:adj|adjective)$/iu.test(tag),
                    ),
                  ) ||
                    (word.forms.some((form) =>
                      /(?:^Partizip |^(?:present|past).*participle|Deklination|\b(?:strong|weak|mixed)\b)/iu.test(
                        form,
                      ),
                    ) &&
                      word.meanings.some((meaning) =>
                        meaningTags(meaning).some((tag) =>
                          /^(?:v|verb)$/iu.test(tag),
                        ),
                      ))),
              )
              .map((word) => word.lemma)
          : [],
      );
      const modifiers = new Set([
        ...adjectives,
        ...words
          .filter(
            (word) =>
              word.lemma === part &&
              word.meanings.some((meaning) =>
                meaningTags(meaning).some((tag) =>
                  /^(?:adv|adverb)$/iu.test(tag),
                ),
              ),
          )
          .map((word) => word.lemma),
      ]);
      const stemLemmas = new Set(
        (stems.get(part) || []).flatMap((stem) =>
          (matches.get(stem)?.words || [])
            .filter(
              (word) =>
                word.lemma === stem &&
                word.meanings.some((meaning) =>
                  meaningTags(meaning).some((tag) =>
                    (stem === part + "e"
                      ? /^(?:n|noun|s|substantiv)$/iu
                      : /^(?:v|verb)$/iu
                    ).test(tag),
                  ),
                ),
            )
            .map((word) => word.lemma),
        ),
      );
      lemmas.set(part, {
        lemma: match?.lemma,
        stem: stemLemmas.has(part + "e")
          ? part + "e"
          : stemLemmas.size === 1
            ? stemLemmas.values().next().value
            : undefined,
        verb: words.find(
          (word) =>
            folded(word.lemma, "de") === folded(part, "de") &&
            word.meanings.some((meaning) =>
              meaningTags(meaning).some((tag) => /^(?:v|verb)$/iu.test(tag)),
            ),
        )?.lemma,
        affix: words.find(
          (word) =>
            folded(word.lemma, "de") === folded(part, "de") &&
            word.meanings.some((meaning) =>
              meaningTags(meaning).some((tag) =>
                (part.startsWith("-")
                  ? /^(?:suf|suff|suffix)$/iu
                  : /^(?:pref|prefix|präf|präfix)$/iu
                ).test(tag),
              ),
            ),
        )?.lemma,
        adjective:
          adjectives.size === 1 ? adjectives.values().next().value : undefined,
        modifier:
          modifiers.size === 1 ? modifiers.values().next().value : undefined,
        inflectedHead:
          inflectedHeads.size > 1 ? part : inflectedHeads.values().next().value,
        // An attested Blase → Blasen plural supplies the stem in Blasengröße.
        pluralStem:
          words.find(
            (word) =>
              word.meanings.length &&
              word.lemma + "n" === part &&
              word.forms.some((form) => /\bplural\b/iu.test(form)),
          )?.lemma ?? (inflectedHeads.size > 1 ? part : undefined),
      });
    }
  }

  const splits = new Map<string, GermanCompoundPart[]>();
  let pending = terms.map((term) => ({
    term,
    split: splitGermanCompound(term, lemmas),
  }));
  while (pending.length) {
    const parts: string[] = [];
    pending = pending.filter(({ term, split }) => {
      const step = split.next();
      if (!step.done) {
        for (const part of step.value) parts.push(part);
        return true;
      }
      if (step.value.length) splits.set(term, step.value);
      return false;
    });
    await readLemmas(parts);
  }
  return splits;
}

export async function lookupGermanCompoundParts(term: string) {
  term = normalize(term.trim());
  const splits = await lookupGermanCompounds([term]);
  return splits.get(term)?.map((part) => part.term) ?? [];
}
