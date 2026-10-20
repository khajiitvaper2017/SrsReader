import { meaningSchema } from "@/dictionaries/model";
import { normalize } from "@/languages/text";
import { t } from "@/shared/i18n/i18n";
import { scheduleSchema } from "@/srs/model";
import { translationSchema } from "@/translation/model";
import type { WordState } from "@/vocabulary/state";
import { z } from "zod";

export const wordId = (language: string, lemma: string, reading: string) =>
  JSON.stringify([language, normalize(lemma), normalize(reading)]);

export const contextSchema = z
  .object({
    sentence: z.string(),
    surface: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    url: z.string(),
    title: z.string(),
    mined: z.number().finite(),
    translation: translationSchema.optional(),
  })
  .refine(
    (c) =>
      c.end >= c.start &&
      c.end <= c.sentence.length &&
      c.sentence.slice(c.start, c.end) === c.surface,
    { error: () => t("invalid_sentence_offsets") },
  );

export type ReadingContext = z.infer<typeof contextSchema>;

export const vocabularySchema = z.object({
  id: z.string(),
  language: z.string(),
  lemma: z.string().min(1),
  reading: z.string(),
  meanings: z.array(meaningSchema),
  contexts: z.array(contextSchema),
  known: z.boolean(),
  suspended: z.boolean(),
  card: scheduleSchema.nullable(),
  srsVersion: z.number().int().nonnegative().default(0),
  leech: z.boolean().default(false),
  retentionOverride: z.number().min(0.7).max(0.99).nullable().default(null),
  version: z.number().int().nonnegative(),
  created: z.number().finite(),
  updated: z.number().finite(),
});

export type Vocabulary = z.infer<typeof vocabularySchema>;

export function stateOf(
  word: Vocabulary | undefined,
  matureIntervalDays: number,
): WordState {
  if (!word) return "unknown";
  if (word.known) return "known";
  if (word.suspended) return "suspended";
  if (!word.card || word.card.state === 0) return "new";
  if (word.card.due <= Date.now()) return "due";
  return word.card.scheduled_days >= matureIntervalDays ? "review" : "learning";
}
