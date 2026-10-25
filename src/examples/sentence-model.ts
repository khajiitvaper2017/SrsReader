import { contextSchema, type ReadingContext } from "@/vocabulary/model";
import { z } from "zod";
import { languageSchema } from "@/languages/model";

export const sentenceSchema = z.object({
  id: z.string(),
  language: languageSchema,
  sentence: z.string(),
  url: z.string(),
  title: z.string(),
  mined: z.number().finite(),
  translation: contextSchema.shape.translation,
  wordIds: z.array(z.string()),
  selectedWordIds: z.array(z.string()).optional(),
  tokens: z.array(
    z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
      ids: z.array(z.string()),
    }),
  ),
});
export type CachedSentence = z.infer<typeof sentenceSchema>;
export const sentenceId = (language: string, sentence: string) =>
  JSON.stringify([language, sentence]);

export function sentenceFromContext(
  language: string,
  context: ReadingContext,
  wordId: string,
): CachedSentence {
  const tokens = [
    ...new Intl.Segmenter(language, { granularity: "word" }).segment(
      context.sentence,
    ),
  ]
    .filter((part) => part.isWordLike)
    .map((part) => ({
      start: part.index,
      end: part.index + part.segment.length,
      ids: [] as string[],
    }));
  if (context.end > context.start)
    tokens.push({ start: context.start, end: context.end, ids: [wordId] });
  return {
    ...context,
    id: sentenceId(language, context.sentence),
    language,
    wordIds: [wordId],
    tokens,
  };
}

export function mergeSentence(
  before: CachedSentence | undefined,
  next: CachedSentence,
): CachedSentence {
  if (!before) return next;
  const tokens = new Map(
    before.tokens.map((token) => [`${token.start}:${token.end}`, token]),
  );
  for (const token of next.tokens) {
    const key = `${token.start}:${token.end}`;
    tokens.set(key, {
      ...token,
      ids: [...new Set([...(tokens.get(key)?.ids || []), ...token.ids])],
    });
  }
  return {
    ...next,
    url: next.url || before.url,
    title: next.title || before.title,
    mined: Math.min(before.mined, next.mined),
    translation: next.translation || before.translation,
    wordIds: [...new Set([...before.wordIds, ...next.wordIds])],
    selectedWordIds: [
      ...new Set([
        ...(before.selectedWordIds || []),
        ...(next.selectedWordIds || []),
      ]),
    ],
    tokens: [...tokens.values()],
  };
}
