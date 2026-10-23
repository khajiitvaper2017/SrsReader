import { lookupMany } from "@/dictionaries/lookup";
import type { LookupResult, LookupWord } from "@/dictionaries/model";
import {
  lookupNechybujte,
  mergeNechybujte,
  nechybujteCacheKey,
  normalizeCzechReflexive,
} from "@/dictionaries/nechybujte";
import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { occurrenceAnalysis } from "@/languages/udpipe";
import type { Occurrence } from "@/languages/analysis";
import { listDictionaries } from "@/dictionaries/storage";
import { dictionaryDisplay, displayedWords } from "@/dictionaries/display";
import { wordId } from "@/vocabulary/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";

export async function lookup(
  term: string,
  settings: Settings,
  refreshOnline = false,
  occurrence?: Occurrence,
): Promise<LookupResult> {
  const lookupTerm =
    settings.studyLanguage === "cs" ? normalizeCzechReflexive(term) : term;
  const contextual = await occurrenceAnalysis(occurrence, term);
  const terms = [...new Set([...(contextual?.terms || []), lookupTerm])];
  const grammar = contextual?.grammar;
  const baseTokens =
    grammar?.sentence.tokens.filter((token) =>
      grammar.group
        ? grammar.group.tokenIds.includes(token.id) &&
          !grammar.group.tokenIds.includes(token.head)
        : grammar.tokenIds.includes(token.id),
    ) || [];
  const bases = [
    ...new Set([
      ...(grammar?.group ? [grammar.group.lemma] : []),
      ...baseTokens
        .map((token) => token.lemma)
        .filter((lemma) => lemma !== "_"),
    ]),
  ];
  const matches = await lookupMany(terms, settings.studyLanguage);
  const dictionaries = await listDictionaries(settings);
  const online = dictionaries.find(
    (dictionary) => dictionary.id === "nechybujte",
  )!;
  const onlineMode = dictionaryDisplay(online.id, settings);
  const higher = new Set(
    dictionaries
      .filter(
        (dictionary) => dictionary.enabled && dictionary.order < online.order,
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
  if (
    settings.studyLanguage === "cs" &&
    (onlineMode === "show" || (onlineMode === "fallback" && !higherMatch))
  ) {
    try {
      const first = terms[0]!;
      // Unknown lemmas can return unrelated fuzzy matches from Nechybujte.
      const onlineTerm =
        contextual &&
        !contextual.grammar.group &&
        !preferred.words.some(
          (word) => folded(word.lemma, "cs") === folded(first, "cs"),
        )
          ? lookupTerm
          : first;
      if (onlineTerm !== first)
        matches.set(normalize(first), { words: [], unresolved: [] });
      const online = await lookupNechybujte(onlineTerm, refreshOnline);
      if (onlineTerm !== first)
        await db.nechybujte.put({
          term: nechybujteCacheKey(first),
          result: online,
        });
      matches.set(
        normalize(first),
        mergeNechybujte(
          onlineTerm === first ? preferred : { words: [], unresolved: [] },
          online,
          first,
        ),
      );
    } catch (error) {
      warning = t("nechybujte_unavailable", {
        message: (error as Error).message,
      });
    }
  }
  const result: LookupResult = {
    words: [],
    unresolved: [],
    warning,
    grammar: contextual?.grammar,
  };
  for (const candidate of terms) {
    const match = matches.get(normalize(candidate));
    result.words.push(...(match?.words || []));
    result.unresolved.push(...(match?.unresolved || []));
  }
  result.words = displayedWords(result.words, settings, dictionaries, bases);
  const saved = await db.vocabulary.bulkGet(
    result.words.map((word) => word.id),
  );
  result.words = result.words.map((word, index) => ({
    ...word,
    meanings: applyDefinitionOverrides(word.meanings, saved[index]),
  }));
  for (const lemma of bases) {
    if (
      result.words.some(
        (word) =>
          folded(word.lemma, word.language) === folded(lemma, word.language),
      )
    )
      continue;
    result.words.push({
      id: wordId(settings.studyLanguage, lemma, ""),
      lemma,
      language: settings.studyLanguage,
      reading: "",
      forms: [],
      meanings: [],
    });
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
        studyLanguage: saved?.language || settings.studyLanguage,
      },
      false,
      occurrence,
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
