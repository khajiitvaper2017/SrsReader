import type {
  RwkvCard,
  RwkvEntity,
  RwkvMeta,
} from "@/srs/engines/rwkv/records";
import { scheduleSchema } from "@/srs/model";
import { vocabularySchema } from "@/vocabulary/model";
import { z } from "zod";

export const reviewSchema = z.object({
  id: z.string(),
  wordId: z.string(),
  time: z.number().finite(),
  rating: z.number().int().min(1).max(4),
  source: z.enum(["reading", "review"]),
  before: vocabularySchema.nullable(),
  afterVersion: z.number().int(),
  log: z.record(
    z.string(),
    z.union([z.number().finite(), z.string(), z.null()]),
  ),
  scheduler: z.enum(["ts-fsrs@5.4.2/FSRS-6", "rwkv-sm40v2-w8-s8"]),
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
  undo?: {
    reviewId: string;
    entities: RwkvEntity[];
    card?: RwkvCard;
    meta: RwkvMeta;
  };
};
