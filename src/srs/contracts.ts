import type { Settings } from "@/settings/model";
import { selection } from "@/vocabulary/contracts";
import type { Vocabulary } from "@/vocabulary/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("grade"),
    ...selection,
    id: z.string(),
    rating: z.number().int().min(1).max(4),
    durationMs: z.number().finite().nonnegative().nullable().optional(),
    time: z.number().finite().optional(),
    source: z.enum(["reading", "review"]),
    version: z.number().int().nonnegative(),
  }),
  z.object({ action: z.literal("undo"), id: z.string() }),
  z.object({ action: z.literal("queue") }),
  z.object({
    action: z.literal("preview"),
    id: z.string(),
    durationMs: z.number().finite().nonnegative().nullable().optional(),
  }),
  z.object({ action: z.literal("rwkvStatus") }),
  z.object({ action: z.literal("resetRwkv") }),
  z.object({ action: z.literal("prepareRwkv") }),
  z.object({
    action: z.literal("activateAlgorithm"),
    algorithm: z.enum(["fsrs", "rwkv"]),
  }),
  z.object({ action: z.literal("reschedule"), after: z.string().default("") }),
  z.object({ action: z.literal("stats") }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  grade: { word: Vocabulary; reviewId: string };
  undo: void;
  queue: {
    words: Vocabulary[];
    due: number;
    fresh: number;
    waiting: number | null;
    wakeAt: number;
  };
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
  reschedule: { count: number; cursor: string | null };
  stats: { total: number; known: number; due: number; today: number };
};
