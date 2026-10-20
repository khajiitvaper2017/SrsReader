import { cacheAudio } from "@/audio/cache";
import { notify } from "@/background/events";
import { clearLookupCache } from "@/dictionaries/lookup";
import type { LookupWord } from "@/dictionaries/model";
import { lookup, resolved } from "@/dictionaries/resolve";
import { folded } from "@/languages/text";
import { srsWrite } from "@/platform/locks";
import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import type { Request } from "@/vocabulary/contracts";
import { wordId } from "@/vocabulary/model";
import { snapshot } from "@/vocabulary/snapshot";
import {
  definePersonalWord,
  deleteDefinition,
  deleteWord,
  editWord,
  getWord,
  languageWords,
  mine,
  replaceMeanings,
  saveTranslation,
  setMastered,
  setRetentionOverride,
  setSuspended,
} from "@/vocabulary/storage";

export function handleVocabulary(request: Request, settings: Settings) {
  return request.action === "mine" ||
    request.action === "defineWord" ||
    request.action === "known" ||
    request.action === "suspend" ||
    request.action === "deleteWord" ||
    request.action === "retentionOverride"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "saveTranslation":
      await saveTranslation(request);
      await notify(request.id);
      return;
    case "word":
      return getWord(request.id);
    case "mine": {
      const word = await snapshot(await resolved(request.term, request.id));
      const saved = await mine(word, request.context);
      cacheAudio(word);
      await notify(word.id);
      return saved;
    }
    case "defineWord": {
      const lemma = folded(request.term.trim(), settings.studyLanguage);
      const word: LookupWord = request.id
        ? await snapshot(await resolved(request.term, request.id))
        : {
            id: wordId(settings.studyLanguage, lemma, ""),
            lemma,
            reading: "",
            language: settings.studyLanguage,
            meanings: [],
            forms: [],
          };
      const saved = await definePersonalWord(
        word,
        request.definition,
        request.context,
      );
      await notify(saved.id);
      return saved;
    }
    case "deleteDefinition":
      await deleteDefinition(request);
      await notify(request.id);
      return;
    case "known": {
      const word = await snapshot(await resolved(request.term, request.id));
      const result = await setMastered(word, request.value);
      await notify(word.id);
      return result;
    }
    case "suspend":
      await setSuspended(request);
      await notify(request.id);
      return;
    case "deleteWord":
      await deleteWord(request);
      await notify(request.id);
      return;
    case "editWord":
      await editWord(request);
      await notify(request.id);
      return;
    case "refreshWord": {
      const saved = await getWord(request.id);
      if (!saved) throw new Error(t("word_not_found"));
      clearLookupCache();
      const response = await lookup(
        saved.lemma,
        {
          ...settings,
          studyLanguage: saved.language,
        },
        true,
      );
      if (response.warning) throw new Error(response.warning);
      const result = response.words.find((w) => w.id === saved.id);
      if (
        !result ||
        !result.meanings.some((meaning) => meaning.dictionaryId !== "personal")
      )
        throw new Error(
          t("no_definition_is_available_in_the_enabled_dictionaries"),
        );
      const updated = await snapshot({
        ...result,
        meanings: result.meanings.filter(
          (meaning) => meaning.dictionaryId !== "personal",
        ),
      });
      await replaceMeanings(saved.id, updated.meanings);
      await notify(saved.id);
      return;
    }
    case "words":
      return (await languageWords(settings.studyLanguage))
        .filter((w) =>
          folded(w.lemma, settings.studyLanguage).includes(
            folded(request.query, settings.studyLanguage),
          ),
        )
        .sort((a, b) => b.updated - a.updated);
    case "retentionOverride":
      await setRetentionOverride(request);
      await notify(request.id);
      return;
  }
}
