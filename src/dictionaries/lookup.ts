import type {
  Dictionary,
  Entry,
  EntryMatch,
  LookupResult,
  LookupWord,
} from "@/dictionaries/model";
import { nechybujteCacheKey } from "@/dictionaries/nechybujte";
import { isOnlineDictionary, mergeOnline } from "@/dictionaries/online";
import { spanishDictCacheKey } from "@/dictionaries/spanishdict";
import { analyzeWords } from "@/languages/morphology";
import {
  parsingCandidates,
  type ParsingCandidate,
} from "@/languages/parsing-rules";
import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import { wordId } from "@/vocabulary/model";
import { getSettings } from "@/settings/store";
import { listDictionaries } from "@/dictionaries/storage";
import { displayedMeanings } from "@/dictionaries/display";
import { applyDefinitionOverrides, meaningKey } from "@/vocabulary/definitions";

type LookupEntry = Omit<Entry, "sequence"> & { defined: boolean };

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
  withDefinitions: boolean,
) {
  const started = performance.now();
  const keys = [...new Set(terms.map((t) => folded(t, language)))];
  const table = withDefinitions ? db.entries : db.entryMatches;
  const rows = await table
    .where("[revisionId+folded]")
    .anyOf(dictionaries.flatMap((d) => keys.map((k) => [d.revisionId, k])))
    .toArray();
  const entries: LookupEntry[] = rows.map((entry) => ({
    ...entry,
    defined: withDefinitions
      ? entry.definitions.some((definition) => !Array.isArray(definition))
      : (entry as EntryMatch).defined,
  }));
  console.info("[SrsReader] Dictionary entries read", {
    terms: keys.length,
    dictionaries: dictionaries.length,
    entries: entries.length,
    withDefinitions,
    elapsedMs: Math.round(performance.now() - started),
  });
  const groups = new Map<string, LookupEntry[]>();
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
  localAnalysis: boolean,
  withDefinitions: boolean,
): Promise<Map<string, LookupResult>> {
  const dictionaries = await activeDictionaries(language);
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
  if (!missing.length || !dictionaries.length) return results;
  const graph = await fetchTerms(
    missing,
    dictionaries,
    language,
    withDefinitions,
  );
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
        withDefinitions,
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
          entry.defined &&
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
): Promise<Map<string, LookupResult>> {
  const started = performance.now();
  const settings = await getSettings();
  const ordered = await listDictionaries(settings);
  const results = await dictionaryLookup(
    terms,
    language,
    localAnalysis,
    withDefinitions,
  );
  const dictionaryFinished = performance.now();
  const lemmas = [
    ...new Set([
      ...terms.flatMap((term) => [normalize(term), folded(term, language)]),
      ...[...results.values()].flatMap((result) =>
        result.words.map((word) => word.lemma),
      ),
    ]),
  ];
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
  const savedQueryFinished = performance.now();
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
  const savedMergeFinished = performance.now();
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
  console.info("[SrsReader] Dictionary lookup finished", {
    terms: terms.length,
    localAnalysis,
    withDefinitions,
    savedEntries: savedEntries.length,
    dictionaryMs: Math.round(dictionaryFinished - started),
    savedQueryMs: Math.round(savedQueryFinished - dictionaryFinished),
    savedMergeMs: Math.round(savedMergeFinished - savedQueryFinished),
    cachedDefinitionsMs: Math.round(performance.now() - savedMergeFinished),
    totalMs: Math.round(performance.now() - started),
  });
  return results;
}
