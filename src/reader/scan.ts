import type { ScanWarning } from "@/platform/messaging/events";
import {
  lookupMany,
  lookupPhrases,
  type DictionaryLookupTiming,
} from "@/dictionaries/lookup";
import { lookup } from "@/dictionaries/resolve";
import { isOnlineDictionary } from "@/dictionaries/online";
import { listDictionaries } from "@/dictionaries/storage";
import { displayedWords } from "@/dictionaries/display";
import type { Settings } from "@/settings/model";
import { meaningTags, type LookupWord } from "@/dictionaries/model";
import { folded, normalize } from "@/languages/text";
import type { Occurrence, SurfaceAnalysis } from "@/languages/analysis";
import { getWords } from "@/vocabulary/storage";
import { stateOf } from "@/vocabulary/model";
import { getSettings } from "@/settings/store";
import type { WordState } from "@/vocabulary/state";

export type ScanSpan = {
  start: number;
  end: number;
  term: string;
  ids: string[];
  candidates: { id: string; tags: string[]; state: WordState }[];
  state: WordState | "ignored" | "unparsed";
  occurrence?: Occurrence;
  related?: SurfaceAnalysis["related"];
  properName?: boolean;
};
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export type DictionaryScanTiming = DictionaryLookupTiming & {
  dictionaryListMs: number;
  segmentMs: number;
  phraseQueryMs: number;
  phraseRows: number;
  phraseDatabaseRows: number;
  phraseMatchMs: number;
  termLookupMs: number;
  wordStateMs: number;
  buildSpansMs: number;
};

export async function scanTexts(
  texts: string[],
  language: string,
  settings: Settings,
  analyses: SurfaceAnalysis[][],
  explicitLookup: boolean,
  warn: ScanWarning,
  timing: DictionaryScanTiming,
  onProgress: (index: number, spans: ScanSpan[]) => Promise<void>,
) {
  const started = performance.now();
  const ordered = await listDictionaries(settings);
  const segmentStarted = performance.now();
  timing.dictionaryListMs = segmentStarted - started;
  const dictionaries = ordered.filter(
    (dictionary) =>
      dictionary.enabled &&
      dictionary.language === language &&
      dictionary.count > 0,
  );
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const segments = texts.map((text) =>
    [...segmenter.segment(text)].filter((s) => s.isWordLike),
  );
  const firsts = [
    ...new Set(
      segments.flatMap((block) =>
        block.map((s) => folded(s.segment, language)),
      ),
    ),
  ];
  const phrasesStarted = performance.now();
  timing.segmentMs = phrasesStarted - segmentStarted;
  const { phrases, databaseRows } = await lookupPhrases(
    dictionaries.map((dictionary) => dictionary.revisionId),
    firsts,
  );
  const matchStarted = performance.now();
  timing.phraseQueryMs = matchStarted - phrasesStarted;
  timing.phraseRows = phrases.length;
  timing.phraseDatabaseRows = databaseRows;
  const byFirst = new Map<
    string,
    Map<
      string,
      { phrase: string; literal: string; pattern?: RegExp; order: number }[]
    >
  >();
  const seen = new Set<string>();
  for (const phrase of phrases) {
    if (seen.has(phrase.text)) continue;
    seen.add(phrase.text);
    const prefixes = byFirst.get(phrase.first) || new Map();
    const prefix =
      /^\S+\s+\S/u.exec(phrase.text)?.[0].replace(/\s+/u, " ") || "";
    const list = prefixes.get(prefix) || [];
    list.push({
      phrase: phrase.text,
      literal: phrase.text.replace(/\s+/gu, " "),
      order: seen.size,
    });
    prefixes.set(prefix, list);
    byFirst.set(phrase.first, prefixes);
  }
  const blocks = texts.map((text, index) => {
    const analysis = analyses[index] || [];
    const candidates: {
      start: number;
      end: number;
      term: string;
      analysis?: SurfaceAnalysis;
    }[] = analysis.map((surface) => ({
      start: surface.start,
      end: surface.end,
      term: text.slice(surface.start, surface.end),
      analysis: {
        ...surface,
        terms: [...surface.terms],
        occurrence: { ...surface.occurrence },
      },
    }));
    let contextual = 0;
    for (const segment of segments[index]!) {
      while (analysis[contextual] && analysis[contextual]!.end <= segment.index)
        contextual++;
      const analyzed =
        analysis[contextual] &&
        analysis[contextual]!.start < segment.index + segment.segment.length
          ? candidates[contextual]!.analysis
          : undefined;
      if (analyzed && analyzed.start !== segment.index) continue;
      if (!analyzed)
        candidates.push({
          start: segment.index,
          end: segment.index + segment.segment.length,
          term: segment.segment,
        });
      const prefixes = byFirst.get(folded(segment.segment, language));
      if (!prefixes) continue;
      const remaining = folded(text.slice(segment.index), language);
      const prefix =
        /^\S+\s+\S/u.exec(remaining)?.[0].replace(/\s+/u, " ") || "";
      const phrases = [
        ...(prefixes.get("") || []),
        ...(prefix ? prefixes.get(prefix) || [] : []),
      ].sort((a, b) => a.order - b.order);
      if (!phrases.length) continue;
      const compact = remaining.replace(/\s+/gu, " ");
      for (const candidate of phrases) {
        if (!compact.startsWith(candidate.literal)) continue;
        const { phrase } = candidate;
        candidate.pattern ??= new RegExp(
          `^${escapeRegex(phrase).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{M}\\p{N}])`,
          "u",
        );
        const match = candidate.pattern.exec(remaining);
        if (match && analyzed) {
          analyzed.terms.push(phrase);
          (analyzed.occurrence.phrases ??= []).push(phrase);
        } else if (match)
          candidates.push({
            start: segment.index,
            end: segment.index + match[0].length,
            term: phrase,
          });
      }
    }
    return candidates;
  });
  const lookupStarted = performance.now();
  timing.phraseMatchMs = lookupStarted - matchStarted;
  const matches = await lookupMany(
    [
      ...new Set(
        blocks.flatMap((candidates) =>
          candidates.flatMap(
            (candidate) => candidate.analysis?.terms || [candidate.term],
          ),
        ),
      ),
    ],
    language,
    blocks.some((candidates) =>
      candidates.some((candidate) => !candidate.analysis),
    ),
    false,
    timing,
  );
  const wordStateStarted = performance.now();
  timing.termLookupMs = wordStateStarted - lookupStarted;
  const ids = [
    ...new Set([...matches.values()].flatMap((m) => m.words.map((w) => w.id))),
  ];
  const vocabulary = new Map(
    (await getWords(ids)).filter((v) => v !== undefined).map((v) => [v.id, v]),
  );
  const buildStarted = performance.now();
  timing.wordStateMs = buildStarted - wordStateStarted;
  function present(candidates: (typeof blocks)[number]) {
    const spans: ScanSpan[] = [];
    let end = -1;
    for (const candidate of candidates.sort(
      (a, b) => a.start - b.start || b.end - a.end,
    )) {
      if (candidate.start < end) continue;
      let words: LookupWord[] = [];
      for (const term of candidate.analysis?.terms || [candidate.term])
        words.push(...(matches.get(normalize(term))?.words || []));
      words = displayedWords(
        words,
        settings,
        ordered,
        candidate.analysis?.terms.slice(0, -1),
      );
      if (!words.length && !candidate.analysis) continue;
      const state = words.length
        ? stateOf(vocabulary.get(words[0]!.id), settings.matureIntervalDays)
        : "unparsed";
      spans.push({
        start: candidate.start,
        end: candidate.end,
        term: candidate.term,
        occurrence: candidate.analysis?.occurrence,
        related: candidate.analysis?.related,
        properName: candidate.analysis?.properName,
        ids: words.map((w) => w.id),
        candidates: words.map((word) => ({
          id: word.id,
          tags: word.meanings.flatMap(meaningTags),
          state: stateOf(vocabulary.get(word.id), settings.matureIntervalDays),
        })),
        state,
      });
      end = candidate.end;
    }
    return spans;
  }
  const results = blocks.map(present);
  timing.buildSpansMs = performance.now() - buildStarted;
  if (
    (explicitLookup || settings.wordLoading[language] !== "onLookup") &&
    ordered.some(
      (dictionary) =>
        dictionary.language === language &&
        dictionary.enabled &&
        isOnlineDictionary(dictionary.id),
    )
  ) {
    const emitted = results.map((spans) => JSON.stringify(spans));
    const terms = new Map<string, Set<number>>();
    for (const [index, candidates] of blocks.entries())
      for (const candidate of candidates) {
        const term = candidate.analysis?.terms[0] || candidate.term;
        const indices = terms.get(term) || new Set<number>();
        indices.add(index);
        terms.set(term, indices);
      }
    void (async () => {
      for (const [term, indices] of terms) {
        const current = await getSettings();
        if (
          (!explicitLookup && current.wordLoading[language] === "onLookup") ||
          !current.studyLanguages.includes(language)
        )
          break;
        const result = await lookup(term, {
          ...current,
          studyLanguage: language,
        });
        matches.set(normalize(term), result);
        for (const word of await getWords(result.words.map((word) => word.id)))
          if (word) vocabulary.set(word.id, word);
        for (const index of indices) {
          const spans = present(blocks[index]!);
          const value = JSON.stringify(spans);
          if (emitted[index] === value) continue;
          emitted[index] = value;
          await onProgress(index, spans);
        }
      }
    })().catch((error) =>
      warn("Online word loading failed", { error: String(error) }),
    );
  }
  return results;
}
