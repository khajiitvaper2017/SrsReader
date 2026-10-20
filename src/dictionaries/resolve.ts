import { lookupMany } from "@/dictionaries/lookup";
import type { LookupResult, LookupWord } from "@/dictionaries/model";
import {
  lookupNechybujte,
  mergeNechybujte,
  normalizeCzechReflexive,
} from "@/dictionaries/nechybujte";
import { normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { occurrenceAnalysis } from "@/languages/udpipe";
import type { Occurrence } from "@/languages/analysis";

export async function lookup(
  term: string,
  settings: Settings,
  refreshOnline = false,
  occurrence?: Occurrence,
): Promise<LookupResult> {
  const lookupTerm =
    settings.studyLanguage === "cs" ? normalizeCzechReflexive(term) : term;
  const contextual =
    settings.studyLanguage === "cs"
      ? await occurrenceAnalysis(occurrence, term)
      : undefined;
  const terms = [...new Set([...(contextual?.terms || []), lookupTerm])];
  const matches = await lookupMany(terms, settings.studyLanguage);
  const preferred = matches.get(normalize(terms[0]!)) || {
    words: [],
    unresolved: [],
  };
  let warning: string | undefined;
  if (
    settings.studyLanguage === "cs" &&
    settings.nechybujte &&
    !preferred.words.some((word) =>
      word.meanings.some((meaning) => meaning.dictionaryId !== "nechybujte"),
    )
  ) {
    try {
      matches.set(
        normalize(terms[0]!),
        mergeNechybujte(
          preferred,
          await lookupNechybujte(terms[0]!, refreshOnline),
          terms[0]!,
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
    for (const word of match?.words || [])
      if (!result.words.some((existing) => existing.id === word.id))
        result.words.push(word);
    result.unresolved.push(...(match?.unresolved || []));
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
  const match = (await lookup(term, settings, false, occurrence)).words.find(
    (w) => w.id === id,
  );
  if (match) return match;
  const saved = await db.vocabulary.get(id);
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
