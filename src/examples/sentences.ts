import {
  mergeSentence,
  sentenceFromContext,
  sentenceId,
  type CachedSentence,
} from "@/examples/sentence-model";
import { db } from "@/platform/database/db";
import type { ScanSpan } from "@/reader/scan";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { wordExamples } from "@/examples/query";
import type { SentenceExample } from "@/examples/model";
import { exampleFormRank } from "@/examples/matching";
import { analyzeWords } from "@/languages/morphology";
import { folded } from "@/languages/text";

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
      {
        ...sentenceFromContext(word.language, context, word.id),
        selectedWordIds: [word.id],
      },
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
): Promise<SentenceExample[]> {
  const [records, vocabulary, corpus] = await Promise.all([
    db.sentences.where("wordIds").equals(word.id).toArray(),
    db.vocabulary.where("language").equals(word.language).toArray(),
    wordExamples(word.lemma, word.language, word.lemma, 5),
  ]);
  const tatoeba = corpus.examples.map(({ context }) =>
    sentenceFromContext(word.language, context, word.id),
  );
  const forms = new Set<string>();
  for (const record of records)
    for (const { start, end, ids } of record.tokens)
      if (ids.includes(word.id)) forms.add(record.sentence.slice(start, end));
  const lemma = folded(word.lemma, word.language);
  const analyses = await analyzeWords(
    [...forms].filter((form) => folded(form, word.language) !== lemma),
    word.language,
  );
  const known = new Set(
    vocabulary.filter((entry) => entry.known).map((entry) => entry.id),
  );
  const segmenter = new Intl.Segmenter(word.language, { granularity: "word" });
  const pools = [records, tatoeba].map((records, source) =>
    records
      .flatMap((record) => {
        const parts = [...segmenter.segment(record.sentence)].filter(
          (part) => part.isWordLike,
        );
        const length = parts.length;
        if (!length) return [];
        const target = record.tokens
          .flatMap(({ ids, start, end }) => {
            if (!ids.includes(word.id)) return [];
            const analyzed = analyses.get(record.sentence.slice(start, end));
            const rank = exampleFormRank(
              record.sentence,
              start,
              end,
              word.lemma,
              word.language,
              source === 1 ||
                (!!analyzed && folded(analyzed, word.language) === lemma),
            );
            return rank === undefined ? [] : [{ start, end, rank }];
          })
          .sort((a, b) => a.rank - b.rank || a.start - b.start)[0];
        if (!target) return [];
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
        return [{ record, target, unknown, length }];
      })
      .sort(
        (a, b) =>
          Math.max(0, a.length - 12) - Math.max(0, b.length - 12) ||
          a.unknown - b.unknown ||
          a.length - b.length ||
          b.record.mined - a.record.mined,
      ),
  );
  const seen = new Set<string>();
  return pools
    .flat()
    .sort(
      (a, b) =>
        a.target.rank - b.target.rank ||
        Math.max(0, a.length - 12) - Math.max(0, b.length - 12),
    )
    .filter(({ record }) => {
      if (seen.has(record.sentence)) return false;
      seen.add(record.sentence);
      return true;
    })
    .slice(0, 20)
    .map(({ record, target }) => {
      return {
        sentence: record.sentence,
        surface: record.sentence.slice(target.start, target.end),
        start: target.start,
        end: target.end,
        url: record.url,
        title: record.title,
        mined: record.mined,
        translation: record.translation,
        customTranslations: record.customTranslations,
      };
    });
}
