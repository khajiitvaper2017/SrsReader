import { meaningSchema } from "@/dictionaries/model";
import { folded, normalize } from "@/languages/text";
import { languageSchema } from "@/languages/model";
import { t } from "@/shared/i18n/i18n";
import type { Schedule } from "@/srs/model";
import type { Card, CardDocument } from "@/cards/model";
import type { ReadingCardIdentity } from "@/cards/encounter-key";
import { translationSchema } from "@/translation/model";
import { z } from "zod";

export const wordId = (language: string, lemma: string, reading: string) =>
  JSON.stringify([language, normalize(lemma), normalize(reading)]);

export function personalWordLemma(term: string, language: string) {
  return language === "de"
    ? normalize(term.trim())
    : folded(term.trim(), language);
}

export const contextSchema = z
  .object({
    language: languageSchema.optional(),
    sentence: z.string(),
    surface: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    url: z.string(),
    title: z.string(),
    mined: z.number().finite(),
    translation: translationSchema.optional(),
    customTranslations: z
      .record(languageSchema, z.string().min(1).max(30000))
      .optional(),
  })
  .refine(
    (c) =>
      c.end >= c.start &&
      c.end <= c.sentence.length &&
      c.sentence.slice(c.start, c.end) === c.surface,
    { error: () => t("invalid_sentence_offsets") },
  );

export type ReadingContext = z.infer<typeof contextSchema>;

export const cardFieldSchema = z.object({
  name: z.string().trim().min(1).max(200),
  value: z.string().max(30000),
});

export const vocabularySchema = z.object({
  id: z.string(),
  language: z.string(),
  lemma: z.string().min(1),
  reading: z.string(),
  meanings: z.array(meaningSchema),
  definitionOverrides: z.record(z.string(), z.array(z.string())).optional(),
  hiddenDictionaries: z.array(z.string()).optional(),
  expandedDictionaries: z.array(z.string()).optional(),
  mined: z.boolean().default(true),
  known: z.boolean(),
  readingCardId: z.string().optional(),
  version: z.number().int().nonnegative(),
  created: z.number().finite(),
  updated: z.number().finite(),
});

export type Vocabulary = z.infer<typeof vocabularySchema>;

export type WordWithCards = Vocabulary & {
  linkedCards: (Card & ReadingCardIdentity)[];
  encounterKey?: string;
  cardId?: string;
  card: Schedule | null;
  srsVersion: number;
  suspended: boolean;
  leech: boolean;
  retentionOverride: number | null;
  customFields: z.infer<typeof cardFieldSchema>[];
};

export type ReviewWord = Omit<WordWithCards, "readingCardId"> & {
  wordId?: string;
  noteId: string;
  document: CardDocument;
};

export type ReviewWordSummary = Omit<ReviewWord, "document">;
