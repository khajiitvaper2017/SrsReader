import {
  mergeSentence,
  sentenceFromContext,
  sentenceId,
  type CachedSentence,
} from "@/examples/sentence-model";
import { db } from "@/platform/database/db";
import type { ScanSpan } from "@/reader/scan";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { meaningsMatchPartOfSpeech } from "@/dictionaries/grammar";
import { resolved } from "@/dictionaries/resolve";
import { analyzeTexts, occurrenceAnalysis } from "@/languages/udpipe";
import { udpipeModel } from "@/languages/codes";
import { udpipePermission } from "@/languages/udpipe-permission";
import type { Settings } from "@/settings/model";
import { wordExamples } from "@/examples/query";
import type { SentenceExample } from "@/examples/model";

async function storeSentences(records: CachedSentence[]) {
  if (!records.length) return;
  await db.transaction("rw", db.sentences, async () => {
    for (const record of records)
      await db.sentences.put(
        mergeSentence(await db.sentences.get(record.id), record),
      );
  });
}

export async function cacheContext(
  word: Pick<Vocabulary, "id" | "language">,
  context?: ReadingContext,
) {
  if (context)
    await storeSentences([
      sentenceFromContext(word.language, context, word.id),
    ]);
}

export async function cacheScannedTexts(
  texts: string[],
  scans: ScanSpan[][],
  language: string,
) {
  const records: CachedSentence[] = [];
  const sentences = new Intl.Segmenter(language, { granularity: "sentence" });
  const words = new Intl.Segmenter(language, { granularity: "word" });
  for (const [index, text] of texts.entries()) {
    for (const part of sentences.segment(text)) {
      const sentence = part.segment.trim();
      const wordParts = [...words.segment(sentence)].filter(
        (word) => word.isWordLike,
      );
      if (wordParts.length <= 4) continue;
      const offset = part.index + part.segment.indexOf(sentence);
      const spans = (scans[index] || []).filter(
        (span) => span.start >= offset && span.end <= offset + sentence.length,
      );
      const tokens = spans.map((span) => ({
        start: span.start - offset,
        end: span.end - offset,
        ids: span.ids,
      }));
      for (const word of wordParts) {
        if (
          !tokens.some(
            (token) =>
              token.start <= word.index &&
              token.end >= word.index + word.segment.length,
          )
        )
          tokens.push({
            start: word.index,
            end: word.index + word.segment.length,
            ids: [],
          });
      }
      const wordIds = [...new Set(tokens.flatMap((token) => token.ids))];
      if (!wordIds.length) continue;
      records.push({
        id: sentenceId(language, sentence),
        language,
        sentence,
        url: "",
        title: "",
        mined: Date.now(),
        wordIds,
        tokens,
      });
    }
  }
  await storeSentences(records);
}

export async function sentenceExamples(
  word: Vocabulary,
  settings: Settings,
): Promise<SentenceExample[]> {
  const [records, vocabulary, corpus] = await Promise.all([
    db.sentences.where("wordIds").equals(word.id).toArray(),
    db.vocabulary.where("language").equals(word.language).toArray(),
    wordExamples(word.lemma, word.language, word.lemma, 5),
  ]);
  const cached = new Set(records.map((record) => record.sentence));
  const tatoeba = corpus.examples
    .filter(({ context }) => !cached.has(context.sentence))
    .map(({ context }) => sentenceFromContext(word.language, context, word.id));
  const known = new Set(
    vocabulary.filter((entry) => entry.known).map((entry) => entry.id),
  );
  const segmenter = new Intl.Segmenter(word.language, { granularity: "word" });
  const pools = [records, tatoeba].map((records) =>
    records
      .flatMap((record) => {
        const parts = [...segmenter.segment(record.sentence)].filter(
          (part) => part.isWordLike,
        );
        const length = parts.length;
        if (length <= 4) return [];
        const targets = record.tokens.filter((token) =>
          token.ids.includes(word.id),
        );
        if (!targets.length) return [];
        const understood = record.tokens.filter(
          (token) =>
            token.ids.includes(word.id) ||
            token.ids.some((id) => known.has(id)),
        );
        const unknown = parts.filter(
          (part) =>
            !understood.some(
              (token) =>
                token.start < part.index + part.segment.length &&
                token.end > part.index,
            ),
        ).length;
        return [{ record, targets, unknown, length }];
      })
      .sort(
        (a, b) =>
          a.unknown - b.unknown ||
          a.length - b.length ||
          b.record.mined - a.record.mined,
      ),
  );
  if (!pools.some((candidates) => candidates.length)) return [];
  const parse =
    settings.udpipe &&
    !!udpipeModel(word.language) &&
    (await udpipePermission());
  const source = parse ? await resolved(word.lemma, word.id) : word;
  const meanings = source.meanings.filter(
    (meaning) => !word.hiddenDictionaries?.includes(meaning.dictionaryId),
  );
  const examples: SentenceExample[] = [];
  for (const candidates of pools) {
    const first = examples.length;
    for (
      let offset = 0;
      offset < candidates.length && examples.length - first < 20;
      offset += 20
    ) {
      const batch = candidates.slice(offset, offset + 20);
      const analyses = parse
        ? await analyzeTexts(
            batch.map(({ record }) => record.sentence),
            word.language,
            settings.udpipeModels[word.language],
          ).catch((error) => {
            console.warn("SrsReader: contextual analysis unavailable", error);
            return [];
          })
        : [];
      const matched = await Promise.all(
        batch.map(async ({ record, targets }, index) => {
          for (const target of targets) {
            const surface = record.sentence.slice(target.start, target.end);
            const occurrence = analyses[index]?.surfaces.find(
              (analysis) =>
                analysis.start === target.start && analysis.end === target.end,
            )?.occurrence;
            const analysis = await occurrenceAnalysis(occurrence, surface);
            if (!meaningsMatchPartOfSpeech(meanings, analysis?.grammar))
              continue;
            return {
              sentence: record.sentence,
              surface,
              start: target.start,
              end: target.end,
              url: record.url,
              title: record.title,
              mined: record.mined,
              translation: record.translation,
              grammar: analysis?.grammar,
            };
          }
        }),
      );
      examples.push(...matched.filter((context) => context !== undefined));
    }
  }
  const matching = meanings.flatMap((meaning) => {
    const example = examples.find(
      (example) =>
        example.grammar &&
        meaningsMatchPartOfSpeech([meaning], example.grammar),
    );
    return example ? [example] : [];
  });
  return [
    ...new Set([...examples.slice(0, 1), ...matching, ...examples]),
  ].slice(0, 20);
}
