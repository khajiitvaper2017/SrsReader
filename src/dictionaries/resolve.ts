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

export async function lookup(
  term: string,
  settings: Settings,
  refreshOnline = false,
): Promise<LookupResult> {
  const lookupTerm =
    settings.studyLanguage === "cs" ? normalizeCzechReflexive(term) : term;
  const local = (await lookupMany([lookupTerm], settings.studyLanguage)).get(
    normalize(lookupTerm),
  ) || { words: [], unresolved: [] };
  if (settings.studyLanguage !== "cs" || !settings.nechybujte) return local;
  if (
    local.words.some((word) =>
      word.meanings.some((meaning) => meaning.dictionaryId !== "nechybujte"),
    )
  )
    return local;
  try {
    return mergeNechybujte(
      local,
      await lookupNechybujte(lookupTerm, refreshOnline),
    );
  } catch (error) {
    return {
      ...local,
      warning: t("nechybujte_unavailable", {
        message: (error as Error).message,
      }),
    };
  }
}

export async function resolved(term: string, id: string): Promise<LookupWord> {
  const settings = await getSettings();
  const match = (await lookup(term, settings)).words.find((w) => w.id === id);
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
