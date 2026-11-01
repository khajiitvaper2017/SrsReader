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
  z.object({
    action: z.literal("queue"),
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
    action: z.literal("manageDeck"),
    language: languageSchema,
    deckId: z.string().min(1),
    operation: z.enum(["refresh", "clear", "delete"]),
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
    cardId: z.string().optional(),
    id: z.string(),
    durationMs: z.number().finite().nonnegative().nullable().optional(),
  }),
  z.object({ action: z.literal("rwkvStatus") }),
  z.object({ action: z.literal("resetRwkv") }),
  z.object({ action: z.literal("prepareRwkv") }),
  z.object({
    action: z.literal("activateAlgorithm"),
    algorithm: z.enum(["fsrs", "rwkv"]),
    rwkvMode: z.enum(["curve", "instant"]).optional(),
  }),
  z.object({ action: z.literal("rescheduleModel") }),
  z.object({
    action: z.literal("reschedule"),
    language: languageSchema,
    after: z.string().default(""),
  }),
  z.object({ action: z.literal("stats") }),
  z.object({
    action: z.literal("reviewStats"),
    year: z.number().int().min(1970).max(9998).optional(),
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  studyOverview: Awaited<ReturnType<typeof studyOverview>>;
  createFrequencyDeck: Deck;
  manageDeck: void;
  sentenceExamples: SentenceExample[];
  grade: { word: ReviewWord; reviewId: string };
  undo: void;
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
  rescheduleModel: { count: number; cursor: string | null };
  reschedule: { count: number; cursor: string | null };
  reviewStats: ReviewStatistics;
  stats: { total: number; known: number; due: number; today: number };
};
