import {
  mergeSentence,
  sentenceFromContext,
  sentenceId,
  type CachedSentence,
} from "@/examples/sentence-model";
import { db } from "@/platform/database/db";
import type { ScanSpan } from "@/reader/scan";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";

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
): Promise<ReadingContext[]> {
  const [records, vocabulary] = await Promise.all([
    db.sentences.where("wordIds").equals(word.id).toArray(),
    db.vocabulary.where("language").equals(word.language).toArray(),
  ]);
  const known = new Set(
    vocabulary.filter((entry) => entry.known).map((entry) => entry.id),
  );
  const segmenter = new Intl.Segmenter(word.language, { granularity: "word" });
  return records
    .flatMap((record) => {
      const length = [...segmenter.segment(record.sentence)].filter(
        (part) => part.isWordLike,
      ).length;
      if (length <= 4) return [];
      const targets = record.tokens.filter((token) =>
        token.ids.includes(word.id),
      );
      if (!targets.length) return [];
      const unknown = record.tokens.filter(
        (token) =>
          !targets.some(
            (target) => target.start < token.end && target.end > token.start,
          ) && !token.ids.some((id) => known.has(id)),
      ).length;
      const target = targets[0]!;
      return [{ record, target, unknown, length }];
    })
    .sort(
      (a, b) =>
        a.unknown - b.unknown ||
        a.length - b.length ||
        b.record.mined - a.record.mined,
    )
    .slice(0, 20)
    .map(({ record, target }) => ({
      sentence: record.sentence,
      surface: record.sentence.slice(target.start, target.end),
      start: target.start,
      end: target.end,
      url: record.url,
      title: record.title,
      mined: record.mined,
      translation: record.translation,
    }));
}
