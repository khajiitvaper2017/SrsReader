import type { ReviewWord } from "@/vocabulary/model";
import type { reviewQueue } from "@/srs/queue";
import type { ReviewStatistics } from "@/srs/statistics";
import type { Settings } from "@/settings/model";
import { selection } from "@/vocabulary/contracts";
import type { SentenceExample } from "@/examples/model";
import type { studyOverview } from "@/srs/decks";
import type { Deck } from "@/srs/deck-model";
import { z } from "zod";
import { languageSchema } from "@/languages/model";
import { deckReviewSettingsSchema } from "@/srs/preferences";
import { fsrsConfigSchema, fsrsVersionSchema } from "@/srs/fsrs-config";

export const requests = [
  z.object({
    action: z.literal("grade"),
    ...selection,
    term: selection.term.optional(),
    cardId: z.string().optional(),
    id: z.string(),
    rating: z.number().int().min(1).max(4),
    durationMs: z.number().finite().nonnegative().nullable().optional(),
    time: z.number().finite().optional(),
    source: z.enum(["reading", "review"]),
    version: z.number().int().nonnegative(),
  }),
  z.object({ action: z.literal("undo"), id: z.string() }),
  z.object({ action: z.literal("bury"), cardId: z.string() }),
  z.object({
    action: z.literal("queue"),
    currentCardId: z.string().optional(),
    previous: z.enum(["fresh", "reviews"]).optional(),
    language: languageSchema,
    deckId: z.string().optional(),
    limits: z
      .object({
        newLimit: z.number().int().nonnegative(),
        reviewLimit: z.number().int().nonnegative().nullable(),
      })
      .optional(),
  }),
  z.object({ action: z.literal("studyOverview") }),
  z.object({
    action: z.literal("saveDeck"),
    language: languageSchema,
    id: z.string().min(1).optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((name) => !name.includes("::") && !/\p{Cc}/u.test(name)),
    parentId: z.string().min(1).nullable(),
  }),
  z.object({
    action: z.literal("saveDeckReviewSettings"),
    language: languageSchema,
    deckId: z.string().min(1),
    reviewSettings: deckReviewSettingsSchema.nullable(),
  }),
  z.object({
    action: z.literal("manageDeck"),
    language: languageSchema,
    deckId: z.string().min(1),
    operation: z.enum(["refresh", "clear", "delete"]),
    dictionaryId: z.string().min(1).optional(),
  }),
  z.object({ action: z.literal("sentenceExamples"), id: z.string() }),
  z.object({
    action: z.literal("createFrequencyDeck"),
    dictionaryId: z.string(),
    limit: z.number().int().min(1).max(10000),
    name: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("preview"),
    context: selection.context,
    occurrence: selection.occurrence,
    version: z.number().int().nonnegative().optional(),
    cardId: z.string().optional(),
    id: z.string(),
    durationMs: z.number().finite().nonnegative().nullable().optional(),
  }),
  z.object({ action: z.literal("rwkvStatus") }),
  z.object({ action: z.literal("resetRwkv") }),
  z.object({ action: z.literal("prepareRwkv") }),
  z.object({
    action: z.literal("previewFsrsMigration"),
    version: fsrsVersionSchema,
  }),
  z.object({
    action: z.literal("activateAlgorithm"),
    algorithm: z.enum(["fsrs", "rwkv"]),
    fsrsVersion: fsrsVersionSchema.optional(),
    rwkvMode: z.enum(["curve", "instant"]).optional(),
  }),
  z.object({ action: z.literal("rescheduleModel") }),
  z.object({
    action: z.literal("saveFsrsOptimization"),
    model: fsrsConfigSchema,
    rolloverHour: z.number().int().min(0).max(23),
  }),
  z.object({
    action: z.literal("reschedule"),
    language: languageSchema,
    deckId: z.string().optional(),
    after: z.string().default(""),
  }),
  z.object({ action: z.literal("stats") }),
  z.object({
    action: z.literal("reviewStats"),
    year: z.number().int().min(1970).max(9998).optional(),
    scope: z
      .object({ language: languageSchema, deckId: z.string().optional() })
      .optional(),
    range: z.union([z.literal(30), z.literal(90), z.literal(365)]).optional(),
  }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type Responses = {
  studyOverview: Awaited<ReturnType<typeof studyOverview>>;
  createFrequencyDeck: Deck;
  manageDeck: void;
  saveDeck: void;
  saveDeckReviewSettings: void;
  sentenceExamples: SentenceExample[];
  grade: { word: ReviewWord; reviewId: string; autoBuried: boolean };
  undo: void;
  bury: void;
  queue: Awaited<ReturnType<typeof reviewQueue>>;
  preview: number[];
  rwkvStatus: {
    downloaded: boolean;
    processed: number;
    total: number;
    ready: boolean;
  };
  prepareRwkv: Responses["rwkvStatus"];
  resetRwkv: void;
  activateAlgorithm: Settings;
  rescheduleModel: { count: number; skipped: number; cursor: string | null };
  saveFsrsOptimization: Settings;
  previewFsrsMigration: { eligible: number; skipped: number };
  reschedule: { count: number; cursor: string | null };
  reviewStats: ReviewStatistics;
  stats: { total: number; known: number; due: number; today: number };
};
