import { cacheAudio } from "@/audio/cache";
import { notify } from "@/background/events";
import { clearLookupCache } from "@/dictionaries/lookup";
import type { LookupWord } from "@/dictionaries/model";
import { lookup, resolved } from "@/dictionaries/resolve";
import { dictionaryGrammarTags } from "@/dictionaries/grammar";
import { dictionaryTags, listDictionaries } from "@/dictionaries/storage";
import { analyzeTexts, occurrenceAnalysis } from "@/languages/udpipe";
import { udpipeModel } from "@/languages/codes";
import { udpipePermission } from "@/languages/udpipe-permission";
import { folded } from "@/languages/text";
import { srsWrite } from "@/platform/locks";
import type { Settings } from "@/settings/model";
import { db } from "@/platform/database/db";
import { studyGroups, wordsInDeck } from "@/srs/deck-words";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import type { Request } from "@/vocabulary/contracts";
import { wordId } from "@/vocabulary/model";
import { snapshot } from "@/vocabulary/snapshot";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";
import {
  definePersonalWord,
  deleteDefinition,
  deleteWord,
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
    request.action === "deleteDefinition" ||
    request.action === "restoreDefinition" ||
    request.action === "dictionaryVisibility" ||
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
      return;
    case "word":
      return getWord(request.id);
    case "cardDefinitions": {
      const saved = await getWord(request.id);
      if (!saved) throw new Error(t("word_not_found"));
      const context = request.context;
      const analyses =
        context &&
        settings.udpipe &&
        udpipeModel(saved.language) &&
        (await udpipePermission())
          ? await analyzeTexts(
              [context.sentence],
              saved.language,
              settings.udpipeModels[saved.language],
            ).catch((error) => {
              console.warn("SrsReader: contextual analysis unavailable", error);
              return [];
            })
          : [];
      const occurrence = analyses[0]?.surfaces.find(
        (surface) =>
          surface.start === context?.start && surface.end === context.end,
      )?.occurrence;
      const result = await lookup(
        occurrence ? context!.surface : saved.lemma,
        { ...settings, studyLanguage: saved.language },
        false,
        occurrence,
      );
      return {
        saved,
        word: result.words.find((word) => word.id === saved.id) || {
          ...saved,
          meanings: applyDefinitionOverrides(saved.meanings, saved),
          forms: [],
        },
        grammar: result.grammar,
        occurrence,
      };
    }
    case "mine": {
      const word = {
        forms: [],
        ...((await getWord(request.id)) ??
          (await snapshot(
            await resolved(request.term, request.id, request.occurrence),
          ))),
      };
      const saved = await mine(word, request.context);
      cacheAudio(word);
      await notify(word.id);
      return saved;
    }
    case "defineWord": {
      settings = { ...settings, studyLanguage: request.language };
      const lemma = folded(request.term.trim(), settings.studyLanguage);
      const word: LookupWord = request.id
        ? await snapshot(
            await resolved(request.term, request.id, request.occurrence),
          )
        : {
            id: wordId(settings.studyLanguage, lemma, ""),
            lemma,
            reading: "",
            language: settings.studyLanguage,
            meanings: [],
            forms: [],
          };
      const contextual = await occurrenceAnalysis(
        request.occurrence,
        request.term,
      );
      const dictionaries = await listDictionaries(settings);
      const available = await dictionaryTags(
        dictionaries
          .filter((dictionary) => dictionary.enabled)
          .map((dictionary) => dictionary.revisionId),
      );
      const saved = await definePersonalWord(
        word,
        request,
        contextual
          ? dictionaryGrammarTags(contextual.grammar, available)
          : undefined,
      );
      await notify(saved.id);
      return saved;
    }
    case "deleteDefinition":
      await deleteDefinition(request);
      await notify(request.id);
      return;
    case "restoreDefinition":
    case "dictionaryVisibility":
      await db.vocabulary
        .where("id")
        .equals(request.id)
        .modify((word) => {
          if (request.action === "restoreDefinition") {
            delete word.definitionOverrides?.[request.dictionaryKey];
          } else {
            word.hiddenDictionaries = (word.hiddenDictionaries || []).filter(
              (id) => id !== request.dictionaryId,
            );
            word.expandedDictionaries = (
              word.expandedDictionaries || []
            ).filter((id) => id !== request.dictionaryId);
            if (request.view === "hidden")
              word.hiddenDictionaries.push(request.dictionaryId);
            if (request.view === "all")
              word.expandedDictionaries.push(request.dictionaryId);
          }
          word.version++;
          word.updated = Date.now();
        });
      await notify(
        request.id,
        request.action === "dictionaryVisibility"
          ? "dictionaryVisibility"
          : "vocabulary",
      );
      return;
    case "known": {
      const word = {
        forms: [],
        ...((await getWord(request.id)) ??
          (await snapshot(
            await resolved(request.term, request.id, request.occurrence),
          ))),
      };
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
    case "words": {
      const language = request.language || settings.studyLanguage;
      const [words, decks] = await Promise.all([
        languageWords(language),
        db.decks.where("language").equals(language).toArray(),
      ]);
      return wordsInDeck(studyGroups(words, decks), request.deckId)
        .sort((a, b) => b.updated - a.updated)
        .map((word) => ({
          ...word,
          meanings: applyDefinitionOverrides(word.meanings, word),
        }));
    }
    case "retentionOverride":
      await setRetentionOverride(request);
      await notify(request.id);
      return;
  }
}
