import { z } from "zod";

const legacyScheduleSchema = z.object({
  due: z.number().finite(),
  stability: z.number().finite().nonnegative(),
  difficulty: z.number().finite().nonnegative(),
  elapsed_days: z.number().finite().nonnegative(),
  scheduled_days: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  last_review: z.number().finite().nullable(),
});

const commonScheduleSchema = z.object({
  due: z.number().finite(),
  scheduled_days: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  last_review: z.number().finite().nullable(),
  last_review_day: z.number().int().nullable().default(null),
  interday: z.boolean(),
  fsrs: z.object({
    stability: z.number().finite().nonnegative(),
    difficulty: z.number().finite().nonnegative(),
  }),
});

export const scheduleSchema = z.union([
  commonScheduleSchema,
  legacyScheduleSchema.transform((card) => ({
    due: card.due,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review,
    last_review_day: null,
    interday:
      (card.state === 1 || card.state === 3) && card.scheduled_days >= 1,
    fsrs: { stability: card.stability, difficulty: card.difficulty },
  })),
]);

export type Schedule = z.infer<typeof scheduleSchema>;
