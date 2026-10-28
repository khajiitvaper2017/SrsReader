import type { AudioInfo } from "@/audio/model";
import { prepareBlob } from "@/audio/playback";
import { preparePronunciation } from "@/audio/prepare";
import { mapDefinitionSenses } from "@/dictionaries/definitions";
import { displayedMeanings } from "@/dictionaries/display";
import { wordFrequencies } from "@/dictionaries/frequency";
import { filterPrepositionSenses } from "@/dictionaries/grammar";
import { listDictionaries } from "@/dictionaries/storage";
import type { Settings } from "@/settings/model";
import { srsClient } from "@/srs/client";
import type { Responses } from "@/srs/contracts";
import { canAutoTranslate, translateSentence } from "@/translation/translate";
import { vocabularyClient } from "@/vocabulary/client";
import type { Responses as VocabularyResponses } from "@/vocabulary/contracts";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";

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
  let dictionaries: ReturnType<typeof listDictionaries> | undefined;
  let queue: Vocabulary[] = [];
  let running: Promise<void> | undefined;

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
      sentences.delete(id);
      definitions.delete(id);
      prepared.delete(id);
    } else {
      sentences.clear();
      definitions.clear();
      frequencies.clear();
      prepared.clear();
      dictionaries = undefined;
    }
  }
  function retain(words: Vocabulary[]) {
    const ids = new Set(words.map((word) => word.id));
    for (const cache of [sentences, definitions, audio, prepared])
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    const frequencyKeys = new Set(
      words.map((word) =>
        JSON.stringify([word.language, word.lemma, word.reading]),
      ),
    );
    for (const key of frequencies.keys())
      if (!frequencyKeys.has(key)) frequencies.delete(key);
  }
  async function prepareText(word: Vocabulary, context?: ReadingContext) {
    const result = await loadDefinitions(word.id, context);
    if (
      !settings.autoTranslateDefinitions &&
      !(settings.autoTranslateSentences && settings.showSentenceTranslation)
    )
      return;
    if (!(await canAutoTranslate(word.language, settings.nativeLanguage)))
      return;
    if (
      context &&
      settings.autoTranslateSentences &&
      settings.showSentenceTranslation &&
      !context.customTranslations?.[settings.nativeLanguage] &&
      context.translation?.language !== settings.nativeLanguage
    ) {
      const translation = {
        text: await translateSentence(
          context.sentence,
          word.language,
          settings.nativeLanguage,
          () => {},
        ),
        language: settings.nativeLanguage,
      };
      context.translation = translation;
    }
    const texts = new Set<string>();
    if (
      settings.autoTranslateDefinitions &&
      !settings.nativeLanguages.includes(word.language)
    ) {
      const rows = (await (dictionaries ??= listDictionaries(settings))).filter(
        (row) => row !== undefined,
      );
      const monolingual = new Set(
        rows
          .filter(
            (row) =>
              row.language === word.language && row.target === word.language,
          )
          .map((row) => row.id),
      );
      for (const meaning of displayedMeanings(
        result.word.meanings,
        settings,
        rows,
      )) {
        if (
          meaning.customDefinitions ||
          result.saved.hiddenDictionaries?.includes(meaning.dictionaryId) ||
          !(
            monolingual.has(meaning.dictionaryId) ||
            meaning.dictionaryId === "nechybujte"
          )
        )
          continue;
        const expanded = result.saved.expandedDictionaries?.includes(
          meaning.dictionaryId,
        );
        const definitions = (
          expanded ? meaning : filterPrepositionSenses(meaning, result.grammar)
        ).definitions;
        mapDefinitionSenses(definitions, (text) => {
          texts.add(text);
          return text;
        });
      }
    }
    for (const text of texts)
      await translateSentence(
        text,
        word.language,
        settings.nativeLanguage,
        () => {},
      );
  }
  function prepare(word: Vocabulary) {
    return cached(prepared, word.id, async () => {
      const recording = loadAudio(word.id).then(async (record) => {
        if (record) await prepareBlob(record.blob);
      });
      const content = loadSentences(word.id).then((contexts) =>
        prepareText(word, contexts[0]),
      );
      await Promise.allSettled([recording, content, loadFrequencies(word)]);
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
  function start(words: Vocabulary[]) {
    const upcoming = words.slice(0, 3);
    retain(upcoming);
    queue = upcoming;
    if (document.hidden) return;
    run();
  }
  function stop() {
    queue = [];
  }
  return {
    loadSentences,
    loadDefinitions,
    loadAudio,
    loadFrequencies,
    invalidate,
    start,
    stop,
  };
}
