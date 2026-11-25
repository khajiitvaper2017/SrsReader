import { z } from "zod";
import { FSRS6_DEFAULT_WEIGHTS } from "ts-fsrs/models/fsrs-6";
import { FSRS7_DEFAULT_WEIGHTS } from "ts-fsrs/models/fsrs-7";
import { t } from "@/shared/i18n/i18n";
import { fsrsConfigSchema } from "@/srs/fsrs-config";

export const timestampSchema = z
  .number()
  .finite()
  .min(-8640000000000000)
  .max(8640000000000000);
export const currentScheduleSchema = z
  .object({
    dueAt: timestampSchema,
    lastReviewAt: timestampSchema.nullable(),
    lastReviewDay: z.number().int().nullable(),
    scheduledDays: z.number().finite().nonnegative(),
    learningStep: z.number().int().nonnegative(),
    state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    scheduleStatus: z.enum(["new", "learning", "review"]),
    reps: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    interday: z.boolean(),
    stability: z.number().finite().nonnegative(),
    difficulty: z.number().finite().nonnegative(),
    stabilityFast: z.number().finite().nonnegative().optional(),
    fsrs: fsrsConfigSchema,
  })
  .superRefine((card, context) => {
    if (
      (card.state === 0) !== (card.lastReviewAt === null) ||
      (card.state !== 0 &&
        card.fsrs.version === "7" &&
        !(card.stabilityFast! > 0))
    )
      context.addIssue({
        code: "custom",
        message: t("srs_fsrs_invalid_memory"),
      });
  });

const oldFields = {
  due: timestampSchema,
  scheduled_days: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  last_review: timestampSchema.nullable(),
};
const oldScheduleSchema = z.object({
  ...oldFields,
  last_review_day: z.number().int().nullable().default(null),
  interday: z.boolean(),
  fsrs: z.object({
    stability: z.number().finite().nonnegative(),
    difficulty: z.number().finite().nonnegative(),
  }),
});
const legacyScheduleSchema = z
  .object({
    ...oldFields,
    stability: z.number().finite().nonnegative(),
    difficulty: z.number().finite().nonnegative(),
    elapsed_days: z.number().finite().nonnegative(),
  })
  .transform((card) => ({
    ...card,
    last_review_day: null,
    interday:
      (card.state === 1 || card.state === 3) && card.scheduled_days >= 1,
    fsrs: { stability: card.stability, difficulty: card.difficulty },
  }));

export const scheduleSchema = z.union([
  currentScheduleSchema,
  z.union([oldScheduleSchema, legacyScheduleSchema]).transform((card) =>
    currentScheduleSchema.parse({
      dueAt: card.due,
      lastReviewAt: card.state === 0 ? null : card.last_review,
      lastReviewDay: card.last_review_day,
      scheduledDays: card.scheduled_days,
      learningStep: card.learning_steps,
      state: card.state,
      scheduleStatus:
        card.state === 0 ? "new" : card.state === 2 ? "review" : "learning",
      reps: card.reps,
      lapses: card.lapses,
      interday: card.interday,
      stability: card.fsrs.stability,
      difficulty: card.fsrs.difficulty,
      fsrs: { version: "6", weights: FSRS6_DEFAULT_WEIGHTS },
    }),
  ),
]);

export type Schedule = z.infer<typeof currentScheduleSchema>;

export function emptySchedule(now = Date.now()): Schedule {
  return {
    dueAt: now,
    lastReviewAt: null,
    lastReviewDay: null,
    scheduledDays: 0,
    learningStep: 0,
    state: 0,
    scheduleStatus: "new",
    reps: 0,
    lapses: 0,
    interday: false,
    stability: 0,
    difficulty: 0,
    stabilityFast: 0,
    fsrs: { version: "7", weights: [...FSRS7_DEFAULT_WEIGHTS] },
  };
}
