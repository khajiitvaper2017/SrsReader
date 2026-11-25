import type { AudioInfo } from "@/audio/model";
import { preparePronunciation } from "@/audio/prepare";
import { wordFrequencies } from "@/dictionaries/frequency";
import type { Settings } from "@/settings/model";
import { deckTree } from "@/srs/deck-tree";
import { srsClient } from "@/srs/client";
import type { Responses } from "@/srs/contracts";
import { vocabularyClient } from "@/vocabulary/client";
import type { Responses as VocabularyResponses } from "@/vocabulary/contracts";
import type { ReadingContext, ReviewWordSummary } from "@/vocabulary/model";
import { getCardDocument } from "@/cards/storage";
import { prepareStudyDocument } from "@/cards/study";
import { cardAssetKey, loadCardAssets } from "@/cards/sandbox/assets";
import { renderCard } from "@/cards/template";
import { db } from "@/platform/database/db";
import type { CardDocument } from "@/cards/model";

function cached<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
  refresh = false,
) {
  if (refresh) cache.delete(key);
  let result = cache.get(key);
  if (!result) {
    result = load();
    cache.set(key, result);
    void result.catch(() => {
      if (cache.get(key) === result) cache.delete(key);
    });
  }
  return result;
}

export function createReviewPreload(settings: Settings) {
  const sentences = new Map<string, Promise<Responses["sentenceExamples"]>>();
  const definitions = new Map<
    string,
    Map<string, Promise<VocabularyResponses["cardDefinitions"]>>
  >();
  const audio = new Map<string, ReturnType<typeof preparePronunciation>>();
  const frequencies = new Map<string, ReturnType<typeof wordFrequencies>>();
  const visuals = new Map<string, Promise<void>>();
  const documents = new Map<
    string,
    {
      version: number;
      reps: number | undefined;
      result: Promise<CardDocument | undefined>;
    }
  >();
  const assets = new Map<string, ReturnType<typeof loadCardAssets>>();
  let retained: ReviewWordSummary[] = [];

  const loadAssets: typeof loadCardAssets = (
    namespace,
    html,
    css,
    source,
    dictionaryAssets,
  ) => {
    const result = cached(assets, cardAssetKey(namespace, html, css), () =>
      loadCardAssets(namespace, html, css, source, dictionaryAssets),
    );
    while (assets.size > 6) assets.delete(assets.keys().next().value!);
    return result;
  };
  function loadDocument(word: ReviewWordSummary, stored?: CardDocument) {
    const existing = documents.get(word.id);
    const reps = word.card?.reps;
    if (existing?.version === word.version && existing.reps === reps)
      return existing.result;
    const result = (
      stored ? Promise.resolve(stored) : getCardDocument(word.id)
    ).then((document) => document && prepareStudyDocument(document));
    documents.set(word.id, { version: word.version, reps, result });
    void result.catch(() => {
      if (documents.get(word.id)?.result === result) documents.delete(word.id);
    });
    return result;
  }
  function prepareVisual(word: ReviewWordSummary) {
    return cached(visuals, word.id, async () => {
      const document = await loadDocument(word);
      if (!document) return;
      const { deckId, language } = document.card;
      const decks = deckId
        ? await db.decks.where("language").equals(language).toArray()
        : [];
      const options = {
        deckName: deckTree(decks).find((deck) => deck.id === deckId)?.name,
        front: settings.front,
        showPartOfSpeech: settings.showPartOfSpeech,
        showGenderedArticle: settings.showGenderedArticle,
      };
      await Promise.all(
        [false, true].map((revealed) =>
          loadAssets(
            document.note.mediaNamespace,
            renderCard(document, revealed, options),
            document.noteType.css,
            undefined,
            document.study?.dictionaryAssets,
          ),
        ),
      );
    });
  }

  function loadSentences(id: string) {
    return cached(sentences, id, () =>
      srsClient({ action: "sentenceExamples", id }),
    );
  }
  function loadDefinitions(
    id: string,
    context?: ReadingContext,
    refresh = false,
  ) {
    let entries = definitions.get(id);
    if (!entries) {
      entries = new Map();
      definitions.set(id, entries);
    }
    return cached(
      entries,
      JSON.stringify([context?.sentence, context?.start, context?.end]),
      () => vocabularyClient({ action: "cardDefinitions", id, context }),
      refresh,
    );
  }
  function loadAudio(id: string, source?: AudioInfo) {
    return cached(audio, id, () => preparePronunciation(id, source), !!source);
  }
  function loadFrequencies(word: Parameters<typeof wordFrequencies>[0]) {
    return cached(
      frequencies,
      JSON.stringify([word.language, word.lemma, word.reading]),
      () => wordFrequencies(word),
    );
  }
  function invalidate(id?: string) {
    if (id) {
      for (const word of retained)
        if (word.id === id || word.wordId === id) {
          visuals.delete(word.id);
          documents.delete(word.id);
        }
      for (const key of assets.keys())
        if (JSON.parse(key)[0] === id) assets.delete(key);
    } else {
      visuals.clear();
      documents.clear();
      assets.clear();
    }
    if (id) {
      sentences.delete(id);
      definitions.delete(id);
    } else {
      sentences.clear();
      definitions.clear();
      frequencies.clear();
    }
  }
  function retain(words: ReviewWordSummary[]) {
    retained = words;
    const ids = new Set(
      words.flatMap((word) =>
        word.wordId ? [word.id, word.wordId] : [word.id],
      ),
    );
    for (const cache of [sentences, definitions, audio, visuals])
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    for (const id of documents.keys()) if (!ids.has(id)) documents.delete(id);
    const frequencyKeys = new Set(
      words.map((word) =>
        JSON.stringify([word.language, word.lemma, word.reading]),
      ),
    );
    for (const key of frequencies.keys())
      if (!frequencyKeys.has(key)) frequencies.delete(key);
  }
  function start(words: ReviewWordSummary[]) {
    const upcoming = words.slice(0, 3);
    retain(upcoming);
    if (document.hidden) return;
    for (const word of upcoming) {
      void prepareVisual(word).catch(() => {});
      if (word.wordId && word.language === settings.studyLanguage) {
        void loadAudio(word.wordId).catch(() => {});
        void loadSentences(word.wordId).catch(() => {});
        void loadFrequencies(word).catch(() => {});
      }
    }
  }
  return {
    loadAssets,
    loadDocument,
    loadSentences,
    loadDefinitions,
    loadAudio,
    loadFrequencies,
    invalidate,
    start,
  };
}
