import { isOnlineDictionary, mergeOnline } from "@/dictionaries/online";
import { lookupSpanishDict } from "@/dictionaries/spanishdict";
import { lookupGermanCompounds, lookupMany } from "@/dictionaries/lookup";
import type { LookupResult, LookupWord } from "@/dictionaries/model";
import {
  lookupNechybujte,
  nechybujteCacheKey,
  normalizeCzechReflexive,
} from "@/dictionaries/nechybujte";
import { folded, hasGermanSuspensionHyphen, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { occurrenceAnalysis } from "@/languages/udpipe";
import type { Occurrence } from "@/languages/analysis";
import { numberSpellout } from "@/languages/number-spellout";
import { listDictionaries } from "@/dictionaries/storage";
import { dictionaryDisplay, displayedWords } from "@/dictionaries/display";
import { wordId } from "@/vocabulary/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";

export async function lookup(
  term: string,
  settings: Settings,
  {
    refreshOnline = false,
    occurrence,
    localOnly = false,
    reading,
  }: {
    refreshOnline?: boolean;
    occurrence?: Occurrence;
    localOnly?: boolean;
    reading?: string;
  } = {},
): Promise<LookupResult> {
  const lookupTerm =
    settings.studyLanguage === "cs" ? normalizeCzechReflexive(term) : term;
  const contextual = await occurrenceAnalysis(occurrence, term);
  const terms = [...new Set([...(contextual?.terms || []), lookupTerm])];
  const grammar = contextual?.grammar;
  const baseTokens =
    grammar && !grammar.splitAbbreviation
      ? grammar.sentence.tokens.filter((token) =>
          grammar.group
            ? grammar.group.tokenIds.includes(token.id) &&
              !grammar.group.tokenIds.includes(token.head)
            : grammar.tokenIds.includes(token.id),
        )
      : [];
  const bases = [
    ...new Set([
      ...(grammar?.group ? [grammar.group.lemma] : []),
      ...baseTokens
        .map((token) => token.lemma)
        .filter((lemma) => lemma !== "_"),
    ]),
  ];
  const [matches, dictionaries] = await Promise.all([
    lookupMany(terms, settings.studyLanguage),
    listDictionaries(settings),
  ]);
  const online = dictionaries.find(
    (dictionary) =>
      isOnlineDictionary(dictionary.id) &&
      dictionary.language === settings.studyLanguage,
  );
  const onlineMode = online ? dictionaryDisplay(online.id, settings) : "hide";
  const higher = new Set(
    dictionaries
      .filter(
        (dictionary) =>
          dictionary.enabled && dictionary.order < (online?.order ?? Infinity),
      )
      .map((dictionary) => dictionary.id),
  );
  const higherMatch = [...matches.values()].some((match) =>
    match.words.some(
      (word) =>
        (!contextual ||
          folded(word.lemma, settings.studyLanguage) ===
            folded(terms[0]!, settings.studyLanguage)) &&
        word.meanings.some((meaning) => higher.has(meaning.dictionaryId)),
    ),
  );
  const preferred = matches.get(normalize(terms[0]!)) || {
    words: [],
    unresolved: [],
  };
  let warning: string | undefined;
  const needsOnline =
    !!online &&
    (onlineMode === "show" || (onlineMode === "fallback" && !higherMatch));
  if (!localOnly && needsOnline && online) {
    try {
      const first = terms[0]!;
      // Unknown lemmas can return unrelated fuzzy matches from Nechybujte.
      const onlineTerm =
        online.id === "nechybujte" &&
        contextual &&
        !contextual.grammar.group &&
        !preferred.words.some(
          (word) => folded(word.lemma, "cs") === folded(first, "cs"),
        )
          ? lookupTerm
          : first;
      if (onlineTerm !== first)
        matches.set(normalize(first), { words: [], unresolved: [] });
      const fetched = await (
        online.id === "nechybujte" ? lookupNechybujte : lookupSpanishDict
      )(onlineTerm, refreshOnline);
      if (onlineTerm !== first)
        await db.nechybujte.put({
          term: nechybujteCacheKey(first),
          result: fetched,
        });
      matches.set(
        normalize(first),
        mergeOnline(
          onlineTerm === first ? preferred : { words: [], unresolved: [] },
          fetched,
          first,
        ),
      );
    } catch (error) {
      warning = t(`${online.id}_unavailable`, {
        message: (error as Error).message,
      });
    }
  }
  const result: LookupResult = {
    words: [],
    unresolved: [],
    warning,
    onlinePending: localOnly && needsOnline,
    grammar: contextual?.grammar,
    numeral: await numberSpellout(
      term,
      settings.studyLanguage,
      contextual?.grammar,
    ),
  };
  for (const candidate of terms) {
    const match = matches.get(normalize(candidate));
    result.words.push(...(match?.words || []));
    result.unresolved.push(...(match?.unresolved || []));
  }
  if (reading !== undefined)
    result.words = result.words.filter(
      (word) => !word.reading || normalize(word.reading) === normalize(reading),
    );
  const saved = new Map(
    (await db.vocabulary.bulkGet(result.words.map((word) => word.id))).flatMap(
      (word) => (word ? [[word.id, word] as const] : []),
    ),
  );
  result.words = displayedWords(
    result.words,
    settings,
    dictionaries,
    bases.length ? bases : [lookupTerm],
    saved,
  ).map((word) => ({
    ...word,
    meanings: applyDefinitionOverrides(word.meanings, saved.get(word.id)),
  }));
  const germanNoun =
    settings.studyLanguage === "de" &&
    baseTokens.some((token) => token.upos === "NOUN" || token.upos === "PROPN");
  const hasNoun = result.words.some((word) =>
    bases.some((base) => normalize(word.lemma) === normalize(base)),
  );
  let nounLemma = normalize(lookupTerm);
  if (germanNoun && !hasNoun && !hasGermanSuspensionHyphen(nounLemma)) {
    const last = (await lookupGermanCompounds([nounLemma]))
      .get(nounLemma)
      ?.at(-1);
    if (last) {
      const head = last.term.replace(/^-/, "");
      nounLemma =
        nounLemma.slice(0, last.start) +
        (last.start === 0 || /[-‐‑(]/u.test(nounLemma[last.start - 1]!)
          ? head[0]!.toLocaleUpperCase("de")
          : head[0]!.toLocaleLowerCase("de")) +
        head.slice(1);
    }
  }
  for (const lemma of result.numeral ? [] : bases) {
    if (germanNoun && hasNoun) continue;
    const headword = germanNoun ? nounLemma : lemma;
    if (
      result.words.some((word) =>
        germanNoun
          ? normalize(word.lemma) === normalize(headword)
          : folded(word.lemma, word.language) ===
            folded(headword, word.language),
      )
    )
      continue;
    const fallback = {
      id: wordId(settings.studyLanguage, headword, ""),
      lemma: headword,
      language: settings.studyLanguage,
      reading: "",
      forms: [],
      meanings: [],
    };
    if (germanNoun) result.words.unshift(fallback);
    else result.words.push(fallback);
  }
  if (result.words.length) result.unresolved = [];
  return result;
}

export async function resolved(
  term: string,
  id: string,
  occurrence?: Occurrence,
): Promise<LookupWord> {
  const settings = await getSettings();
  const saved = await db.vocabulary.get(id);
  const match = (
    await lookup(
      term,
      {
        ...settings,
        studyLanguage: saved?.language || JSON.parse(id)[0],
      },
      { occurrence },
    )
  ).words.find((w) => w.id === id);
  if (match) return match;
  if (saved)
    return {
      id: saved.id,
      lemma: saved.lemma,
      reading: saved.reading,
      language: saved.language,
      meanings: saved.meanings,
      forms: [],
    };
  throw new Error(t("this_word_has_no_dictionary_definition"));
}
