import type { ScanWarning } from "@/platform/messaging/events";
import {
  lookupGermanCompounds,
  lookupMany,
  lookupPhrases,
  type DictionaryLookupTiming,
} from "@/dictionaries/lookup";
import { lookup } from "@/dictionaries/resolve";
import { isOnlineDictionary } from "@/dictionaries/online";
import { listDictionaries } from "@/dictionaries/storage";
import { dictionaryTagValues } from "@/dictionaries/grammar";
import { phraseMatchesPartOfSpeech } from "@/reader/phrase-matching";
import { displayedWords } from "@/dictionaries/display";
import type { Settings } from "@/settings/model";
import {
  isInflectionReference,
  meaningTags,
  type LookupWord,
} from "@/dictionaries/model";
import {
  folded,
  germanHyphenatedCompounds,
  germanInitialAbbreviations,
  spacedGermanAbbreviation,
  germanSuspendedLists,
  hasGermanSuspensionHyphen,
  joinedGermanCompound,
  normalize,
  swissGermanSpelling,
} from "@/languages/text";
import type { Occurrence, SurfaceAnalysis } from "@/languages/analysis";
import { getWords } from "@/vocabulary/storage";
import { stateOf } from "@/vocabulary/state";
import { getSettings } from "@/settings/store";
import type { WordState } from "@/vocabulary/state";
import { cardEncounterKey, cardsForEncounter } from "@/cards/encounter-key";

type CompoundPart = {
  before: number;
  after: number;
  occurrence?: Occurrence;
  headword?: string;
};

type Candidate = {
  start: number;
  end: number;
  term: string;
  analysis?: SurfaceAnalysis;
  phrasePartsOfSpeech?: string[];
  compoundPart?: CompoundPart;
  joined?: string;
};

export type ScanSpan = {
  start: number;
  end: number;
  term: string;
  ids: string[];
  candidates: { id: string; tags: string[]; state: WordState }[];
  state: WordState | "ignored" | "unparsed";
  occurrence?: Occurrence;
  encounterKey?: string;
  related?: SurfaceAnalysis["related"];
  properName?: boolean;
  compoundPart?: CompoundPart;
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
  onComplete: (spans: ScanSpan[][]) => void,
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
  const splitGerman =
    language === "de" &&
    settings.splitGermanCompounds &&
    dictionaries.length > 0;
  const suspendedLists = texts.map((text) =>
    splitGerman && /[-‐‑]/u.test(text) ? [...germanSuspendedLists(text)] : [],
  );
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const graphemes = new Intl.Segmenter(language, { granularity: "grapheme" });
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
  const dottedTerms = new Map<Candidate, string>();
  const blocks = texts.map((text, index) => {
    // Slash-separated words use word segments and indexed dictionary phrases.
    const analysis = (analyses[index] || []).filter(
      (surface) =>
        !/[\p{L}\p{M}\p{N}].*\/.*[\p{L}\p{M}\p{N}]/su.test(
          text.slice(surface.start, surface.end),
        ) &&
        !(
          language === "de" &&
          /\d.*[-‐‑]|[-‐‑].*\d/u.test(text.slice(surface.start, surface.end))
        ),
    );
    const candidates: Candidate[] = analysis.map((surface) => ({
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
      const written = text.slice(segment.index);
      const normalized = normalize(written);
      const remaining = normalized.toLocaleLowerCase(language);
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
        if (
          language === "de" &&
          germanInitialAbbreviations(phrase).next().value?.[0] === phrase
        )
          continue;
        candidate.pattern ??= new RegExp(
          `^${escapeRegex(phrase).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{M}\\p{N}])`,
          "u",
        );
        const match = candidate.pattern.exec(remaining);
        if (!match || match[0].includes("\u2029")) continue;
        let length = match[0].length;
        if (normalized !== written || remaining.length !== written.length) {
          let matched = 0;
          length = 0;
          for (const { segment: part } of graphemes.segment(written)) {
            const size = folded(part, language).length;
            if (matched + size > match[0].length) break;
            matched += size;
            length += part.length;
          }
        }
        const end = segment.index + length;
        if (
          analyzed &&
          (end <= analyzed.end ||
            analyzed.related?.some((range) => range.end === end))
        ) {
          analyzed.terms.push(phrase);
          (analyzed.occurrence.phrases ??= []).push(phrase);
        } else
          candidates.push({
            start: segment.index,
            end,
            term: phrase,
            phrasePartsOfSpeech: analyzed
              ? analysis
                  .filter(
                    (surface) =>
                      surface.start >= segment.index && surface.end <= end,
                  )
                  .flatMap((surface) => surface.partsOfSpeech)
              : undefined,
          });
      }
    }
    if (language === "de") {
      for (const { 0: written, index: start } of germanInitialAbbreviations(
        text,
      )) {
        const end = start + written.length;
        const spaced = spacedGermanAbbreviation(written);
        for (const term of new Set([
          written,
          spaced,
          spaced.replaceAll(" ", ""),
        ]))
          candidates.push({ start, end, term });
      }
      if (dictionaries.length)
        for (const { 0: term, index: start } of germanHyphenatedCompounds(
          text,
        )) {
          if (!splitGerman && hasGermanSuspensionHyphen(term)) continue;
          const end = start + term.length;
          const exact = candidates.find(
            (candidate) => candidate.start === start && candidate.end === end,
          );
          const joined = joinedGermanCompound(term);
          if (exact) exact.joined = joined;
          else candidates.push({ start, end, term, joined });
        }
      for (const candidate of candidates)
        if (
          text[candidate.end] === "." &&
          /^[\p{L}\p{M}]+$/u.test(candidate.term)
        )
          dottedTerms.set(candidate, candidate.term + ".");
    }
    return candidates;
  });
  const lookupStarted = performance.now();
  timing.phraseMatchMs = lookupStarted - matchStarted;
  const matches = await lookupMany(
    [
      ...new Set([
        ...dottedTerms.values(),
        ...blocks.flatMap((candidates) =>
          candidates.flatMap(
            (candidate) => candidate.analysis?.terms || [candidate.term],
          ),
        ),
      ]),
    ],
    language,
    blocks.some((candidates) =>
      candidates.some((candidate) => !candidate.analysis),
    ),
    false,
    timing,
  );
  for (const [candidate, dotted] of dottedTerms) {
    if (
      !matches
        .get(normalize(dotted))
        ?.words.some(
          (word) =>
            word.meanings.length &&
            (folded(word.lemma, language) === folded(dotted, language) ||
              word.forms.some((form) =>
                /^(?:abbreviation|abkürzung)$/iu.test(form),
              )),
        )
    )
      continue;
    candidate.term = dotted;
    candidate.end++;
    if (candidate.analysis) candidate.analysis.terms = [dotted];
  }
  if (language === "de")
    for (const [index, candidates] of blocks.entries()) {
      const joined = candidates.filter((candidate) => {
        const term = candidate.joined;
        if (
          !term ||
          !matches
            .get(normalize(candidate.term))
            ?.words.some(
              (word) =>
                word.meanings.length &&
                folded(word.lemma, "de") === folded(term, "de"),
            )
        )
          return false;
        // Parser fragments cannot outrank the attested whole word.
        candidate.analysis = undefined;
        return true;
      });
      if (joined.length)
        blocks[index] = candidates.filter(
          (candidate) =>
            !joined.some(
              (whole) =>
                candidate !== whole &&
                candidate.start >= whole.start &&
                candidate.end <= whole.end,
            ),
        );
    }
  if (splitGerman) {
    const splitTerms = new Map<Candidate, string>();
    for (const candidates of blocks) {
      for (const candidate of candidates) {
        const suspended = hasGermanSuspensionHyphen(candidate.term);
        if (candidate.analysis?.properName && !suspended && !candidate.joined)
          continue;
        const term = normalize(
          suspended
            ? candidate.term
            : candidate.analysis?.terms[0] || candidate.term,
        );
        if (
          [candidate.term, ...(candidate.analysis?.terms ?? [])].some((word) =>
            matches
              .get(normalize(word))
              ?.words.some((entry) => entry.meanings.length),
          )
        )
          continue;
        splitTerms.set(candidate, term);
      }
    }
    const splits = await lookupGermanCompounds(
      [
        ...new Set([
          ...splitTerms.values(),
          ...[...splitTerms.keys()].map((candidate) =>
            normalize(candidate.term),
          ),
          ...suspendedLists.flatMap((lists) => lists.map((list) => list[2]!)),
        ]),
      ],
      timing,
    );
    const partTerms = new Set<string>();
    const foldGerman = (text: string) =>
      swissGermanSpelling(folded(text, language));
    for (const [index, candidates] of blocks.entries()) {
      const sharedEnds = new Map<number, string>();
      for (const list of suspendedLists[index]!) {
        const tail = splits.get(list[2]!)?.at(-1);
        if (!tail) continue;
        for (const stem of germanHyphenatedCompounds(list[1]!))
          sharedEnds.set(list.index + stem.index, tail.term);
      }
      const markedSplits: Candidate[] = [];
      const replacements = new Map<Candidate, Candidate[]>();
      for (const candidate of candidates) {
        const written = normalize(candidate.term);
        const term = splits.has(written) ? written : splitTerms.get(candidate);
        const parts = term && splits.get(term);
        if (!parts) continue;
        const last = parts.at(-1)!;
        const surface = candidate.term;
        let ranges = parts.map(({ start, end }) => ({ start, end }));
        if (term !== surface) {
          // Match both spellings before translating lemma offsets to the page.
          const prefix = foldGerman(term.slice(0, last.start));
          const written = foldGerman(surface);
          const surfaceTail = written.slice(prefix.length);
          if (!written.startsWith(prefix) || !surfaceTail) continue;
          const offsets = new Map([[0, 0]]);
          let offset = 0;
          for (const { segment, index } of graphemes.segment(surface)) {
            offset += foldGerman(segment).length;
            offsets.set(offset, index + segment.length);
            if (offset >= prefix.length) break;
          }
          const mapOffset = (offset: number) =>
            offsets.get(foldGerman(term.slice(0, offset)).length) ?? -1;
          ranges = ranges.map(({ start, end }, index) => ({
            start: mapOffset(start),
            end: index === ranges.length - 1 ? surface.length : mapOffset(end),
          }));
          if (ranges.some(({ start, end }) => start < 0 || end < 0)) continue;
        }
        let headword: string | undefined;
        if (germanHyphenatedCompounds(surface).next().value?.[0] === surface) {
          markedSplits.push(candidate);
          const sharedEnd = hasGermanSuspensionHyphen(surface)
            ? sharedEnds.get(candidate.start)
            : undefined;
          const joined = (
            sharedEnd ? term + sharedEnd : term.slice(0, last.start) + last.term
          )
            .replace(/[-‐‑[\]()]/gu, "")
            .toLocaleLowerCase("de");
          headword = /^\p{Ll}/u.test(last.term)
            ? surface.replace(/[-‐‑]/gu, " ")
            : joined[0]!.toLocaleUpperCase("de") + joined.slice(1);
        }
        let sourceOccurrence = candidate.analysis?.occurrence;
        if (!sourceOccurrence) {
          const sourceToken = analyses[index]?.find(
            (token) =>
              token.start >= candidate.start && token.end <= candidate.end,
          );
          if (sourceToken) {
            const offset = sourceToken.start - sourceToken.occurrence.start;
            if (candidate.start >= offset)
              sourceOccurrence = {
                key: sourceToken.occurrence.key,
                start: candidate.start - offset,
                end: candidate.end - offset,
              };
          }
        }
        replacements.set(
          candidate,
          parts.map((part, index) => {
            partTerms.add(part.term);
            const start = candidate.start + ranges[index]!.start;
            const end = candidate.start + ranges[index]!.end;
            return {
              term: part.term,
              start,
              end,
              compoundPart: {
                before: start - candidate.start,
                after: candidate.end - end,
                occurrence: sourceOccurrence,
                headword,
              },
            };
          }),
        );
      }
      blocks[index] = candidates.flatMap((candidate) =>
        markedSplits.some(
          (whole) =>
            candidate !== whole &&
            candidate.start >= whole.start &&
            candidate.end <= whole.end,
        )
          ? []
          : (replacements.get(candidate) ?? [candidate]),
      );
    }
    if (partTerms.size)
      for (const [term, result] of await lookupMany(
        [...partTerms],
        language,
        false,
        false,
        timing,
      ))
        matches.set(term, result);
  }
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
  function present(candidates: (typeof blocks)[number], text: string) {
    const spans: ScanSpan[] = [];
    let end = -1;
    for (const candidate of candidates.sort(
      (a, b) => a.start - b.start || b.end - a.end,
    )) {
      if (candidate.start < end) continue;
      let words: LookupWord[] = [];
      for (const term of candidate.analysis?.terms || [candidate.term]) {
        for (const word of matches.get(normalize(term))?.words || []) {
          // Inflected phrase forms must agree with the sentence, not just its spelling.
          if (
            candidate.phrasePartsOfSpeech &&
            !phraseMatchesPartOfSpeech(
              candidate.phrasePartsOfSpeech,
              dictionaryTagValues(word.meanings, "UPOS"),
              isInflectionReference([word.lemma, word.forms]),
            )
          )
            continue;
          words.push(word);
        }
      }
      words = displayedWords(
        words,
        settings,
        ordered,
        candidate.analysis?.terms.slice(0, -1) ?? [],
        vocabulary,
      );
      if (!words.length && !candidate.analysis) continue;
      const encounterKey =
        candidate.analysis?.encounterKey ??
        cardEncounterKey({
          context: {
            surface: text.slice(candidate.start, candidate.end),
            language,
          },
          pos: "",
          feats: {},
        });
      words = words.filter(
        (word) =>
          !word.importedGenders ||
          cardsForEncounter([word], encounterKey).length,
      );
      const state = words.length
        ? stateOf(
            vocabulary.get(words[0]!.id),
            settings.matureIntervalDays,
            encounterKey,
          )
        : "unparsed";
      spans.push({
        start: candidate.start,
        end: candidate.end,
        term: candidate.term,
        occurrence: candidate.analysis?.occurrence,
        encounterKey,
        related: candidate.analysis?.related,
        properName: candidate.analysis?.properName,
        compoundPart: candidate.compoundPart,
        ids: words.map((w) => w.id),
        candidates: words.map((word) => ({
          id: word.id,
          tags: word.meanings.flatMap(meaningTags),
          state: stateOf(
            vocabulary.get(word.id),
            settings.matureIntervalDays,
            encounterKey,
          ),
        })),
        state,
      });
      end = candidate.end;
    }
    return spans;
  }
  const results = blocks.map((candidates, index) =>
    present(candidates, texts[index]!),
  );
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
          const spans = present(blocks[index]!, texts[index]!);
          const value = JSON.stringify(spans);
          if (emitted[index] === value) continue;
          emitted[index] = value;
          results[index] = spans;
          await onProgress(index, spans);
        }
      }
      onComplete(results);
    })().catch((error) =>
      warn("Online word loading failed", { error: String(error) }),
    );
  } else onComplete(results);
  return results;
}
