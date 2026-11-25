import type {
  RwkvCard,
  RwkvEntity,
  RwkvMeta,
} from "@/srs/engines/rwkv/records";
import { scheduleSchema, timestampSchema } from "@/srs/model";
import { cardSchema } from "@/cards/model";
import { z } from "zod";
import { fsrsVersionSchema } from "@/srs/fsrs-config";

export const fsrsLogSchema = z.object({
  cardId: z.union([z.string(), z.number()]),
  dueAt: timestampSchema,
  lastReviewAt: timestampSchema.nullable(),
  reviewTime: timestampSchema,
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  scheduleStatus: z.enum(["new", "learning", "review"]),
  stability: z.number().finite().nonnegative(),
  difficulty: z.number().finite().nonnegative(),
  stabilityFast: z.number().finite().nonnegative().optional(),
  scheduledDays: z.number().finite().nonnegative(),
  learningStep: z.number().int().nonnegative(),
});

export const reviewSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  wordId: z.string().optional(),
  language: z.string(),
  time: z.number().finite(),
  rating: z.number().int().min(1).max(4),
  source: z.enum(["reading", "review"]),
  before: cardSchema
    .pick({
      id: true,
      language: true,
      version: true,
      srsVersion: true,
      schedule: true,
      suspended: true,
      leech: true,
    })
    .nullable(),
  afterVersion: z.number().int(),
  fsrsLog: fsrsLogSchema.nullable().default(null),
  log: z.record(
    z.string(),
    z.union([z.number().finite(), z.string(), z.null()]),
  ),
  scheduler: z.union([
    z.enum([
      "ts-fsrs@5.4.2/FSRS-6",
      "rwkv-sm40v2-w8-s8",
      "rwkv-sm55-w8-s8",
      "rwkv-sm56-w8-s8",
    ]),
    z.templateLiteral(["ts-fsrs@6.0.0/FSRS-", fsrsVersionSchema]),
  ]),
  sequence: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
  durationMs: z.number().finite().nonnegative().nullable().default(null),
  after: scheduleSchema.nullable().default(null),
  afterSrsVersion: z.number().int().nonnegative().default(0),
  retention: z.number().min(0.7).max(0.99),
});

export type Review = z.infer<typeof reviewSchema>;

export type SrsMeta = {
  id: string;
  sequence: number;
  scheduledModel?: string;
  reschedule?: {
    model: string;
    after: string;
    count: number;
    skipped?: number;
  };
  fsrsMigration?: { model: string; skipped: number };
  undo?: {
    reviewId: string;
    entities: RwkvEntity[];
    card?: RwkvCard;
    meta: RwkvMeta;
  };
};
