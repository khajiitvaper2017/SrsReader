import type { AudioInfo } from "@/audio/model";
import { prepareBlob } from "@/audio/playback";
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
  const prepared = new Map<string, Promise<void>>();
  const visuals = new Map<string, Promise<void>>();
  const assets = new Map<string, ReturnType<typeof loadCardAssets>>();
  let queue: ReviewWordSummary[] = [];
  let retained: ReviewWordSummary[] = [];
  let running: Promise<void> | undefined;

  function loadAssets(namespace: string, html: string, css: string) {
    const result = cached(assets, cardAssetKey(namespace, html, css), () =>
      loadCardAssets(namespace, html, css),
    );
    while (assets.size > 6) assets.delete(assets.keys().next().value!);
    return result;
  }
  function prepareVisual(id: string) {
    return cached(visuals, id, async () => {
      const stored = await getCardDocument(id);
      if (!stored) return;
      const document = await prepareStudyDocument(stored);
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
          prepared.delete(word.id);
        }
      for (const key of assets.keys())
        if (JSON.parse(key)[0] === id) assets.delete(key);
    } else {
      visuals.clear();
      assets.clear();
    }
    if (id) {
      sentences.delete(id);
      definitions.delete(id);
      prepared.delete(id);
    } else {
      sentences.clear();
      definitions.clear();
      frequencies.clear();
      prepared.clear();
    }
  }
  function retain(words: ReviewWordSummary[]) {
    retained = words;
    const ids = new Set(
      words.flatMap((word) =>
        word.wordId ? [word.id, word.wordId] : [word.id],
      ),
    );
    for (const cache of [sentences, definitions, audio, prepared, visuals])
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    const frequencyKeys = new Set(
      words.map((word) =>
        JSON.stringify([word.language, word.lemma, word.reading]),
      ),
    );
    for (const key of frequencies.keys())
      if (!frequencyKeys.has(key)) frequencies.delete(key);
  }
  function prepare(word: ReviewWordSummary) {
    return cached(prepared, word.id, async () => {
      if (!word.wordId || word.language !== settings.studyLanguage) return;
      const recording = loadAudio(word.wordId).then(async (record) => {
        if (record) await prepareBlob(record.blob);
      });
      await Promise.allSettled([
        recording,
        loadSentences(word.wordId),
        loadFrequencies(word),
      ]);
    });
  }
  function run() {
    if (running || !queue.length) return;
    running = (async () => {
      while (queue.length) {
        const word = queue.shift()!;
        await prepare(word).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })().finally(() => {
      running = undefined;
      run();
    });
  }
  function start(words: ReviewWordSummary[]) {
    const upcoming = words.slice(0, 3);
    retain(upcoming);
    queue = upcoming;
    if (document.hidden) return;
    // Text and visuals must not wait for a previous card's audio download.
    for (const word of upcoming) {
      void prepareVisual(word.id).catch(() => {});
      if (word.wordId && word.language === settings.studyLanguage) {
        void loadSentences(word.wordId).catch(() => {});
        void loadFrequencies(word).catch(() => {});
      }
    }
    run();
  }
  function stop() {
    queue = [];
  }
  return {
    loadAssets,
    loadSentences,
    loadDefinitions,
    loadAudio,
    loadFrequencies,
    invalidate,
    start,
    stop,
  };
}
