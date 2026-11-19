import { t } from "@/shared/i18n/i18n";
import { reviewBindingsSchema } from "@/srs/controls";
import { z } from "zod";
import type { StepUnit } from "ts-fsrs";
import type { Settings } from "@/settings/model";
import type { Card } from "@/cards/model";

export const fsrsVersionSchema = z.enum(["7", "6"]);

export const learningStepsSchema = z.array(
  z
    .string()
    .regex(/^(?:\d+(?:\.\d+)?|\.\d+)[mhd]$/)
    .refine((step) => parseFloat(step) > 0)
    .transform((step) => step as StepUnit),
);
const retentionBandSchema = z.object({
  upTo: z.number().positive().nullable(),
  retention: z.number().min(0.7).max(0.99),
});
const timedReviewSchema = z.object({
  enabled: z.boolean().default(false),
  showBar: z.boolean().default(true),
  skipNew: z.boolean().default(true),
  questionEnabled: z.boolean().default(true),
  questionSeconds: z.number().int().min(1).max(600).default(8),
  questionAction: z.enum(["reveal", "fail", "alert"]).default("reveal"),
  answerEnabled: z.boolean().default(false),
  answerSeconds: z.number().int().min(0).max(600).default(4),
  answerAction: z.enum(["softFail", "fail"]).default("softFail"),
  sound: z.boolean().default(true),
});
export const srsPreferencesSchema = z.object({
  timedReview: timedReviewSchema.default(timedReviewSchema.parse({})),
  reviewBindings: reviewBindingsSchema,
  front: z.enum(["word", "sentence"]).default("word"),
  autoplayFront: z.boolean().default(false),
  autoplay: z.boolean().default(false),
  showPartOfSpeech: z.boolean().default(true),
  showGenderedArticle: z.boolean().default(true),
  retention: z.number().min(0.7).max(0.99).default(0.8),
  algorithm: z.enum(["fsrs", "rwkv"]).default("fsrs"),
  fsrsVersion: fsrsVersionSchema.default("7"),
  rwkvMode: z.enum(["curve", "instant"]).default("curve"),
  learningSteps: learningStepsSchema.default(["10m"]),
  relearningSteps: learningStepsSchema.default(["10m"]),
  minimumInterval: z.number().int().min(1).max(36500).default(1),
  maximumInterval: z.number().int().min(1).max(36500).default(36500),
  rolloverHour: z.number().int().min(0).max(23).default(4),
  learnAheadMinutes: z.number().nonnegative().finite().default(20),
  reviewLimit: z.number().int().nonnegative().nullable().default(null),
  newGatherOrder: z
    .enum(["frequency", "deck", "deck_random", "oldest", "newest", "random"])
    .default("frequency"),
  newSortOrder: z.enum(["gathered", "random"]).default("gathered"),
  newReviewOrder: z.enum(["before", "mix", "after"]).default("mix"),
  interdayReviewOrder: z.enum(["before", "mix", "after"]).default("mix"),
  reviewSortOrder: z
    .enum([
      "due",
      "due_random",
      "due_deck",
      "deck_due",
      "interval_asc",
      "interval_desc",
      "random",
    ])
    .default("random"),
  leechThreshold: z.number().int().nonnegative().default(8),
  leechAction: z.enum(["suspend", "mark"]).default("suspend"),
  intervalFuzz: z.boolean().default(false),
  dynamicRetention: z.boolean().default(false),
  retentionBands: z
    .array(retentionBandSchema)
    .min(1)
    .refine(
      (bands) =>
        bands.at(-1)?.upTo === null &&
        bands.every(
          (band, index) =>
            index === bands.length - 1 ||
            (band.upTo !== null &&
              (index === 0 ||
                band.upTo > (bands[index - 1]!.upTo ?? Infinity))),
        ),
      t("srs_invalid_bands"),
    )
    .default([
      { upTo: 1000, retention: 0.9 },
      { upTo: 5000, retention: 0.85 },
      { upTo: 20000, retention: 0.8 },
      { upTo: null, retention: 0.75 },
    ]),
  rankSources: z.record(z.string(), z.boolean()).default({}),
  onlyAgainGood: z.boolean().default(false),
  autoBuryFailed: z.boolean().default(false),
  delayMinedCards: z.boolean().default(false),
  newLimit: z.number().int().min(0).max(10000).default(20),
  missingFrequency: z.enum(["last", "random"]).default("last"),
});
export type SchedulingPreferences = z.infer<typeof srsPreferencesSchema>;

const preferences = srsPreferencesSchema.shape;
export const deckReviewSettingsSchema = z.object({
  newLimit: preferences.newLimit.unwrap().optional(),
  reviewLimit: preferences.reviewLimit.unwrap().optional(),
  learningSteps: preferences.learningSteps.unwrap().optional(),
  relearningSteps: preferences.relearningSteps.unwrap().optional(),
  retention: preferences.retention.unwrap().optional(),
  maximumInterval: preferences.maximumInterval.unwrap().optional(),
  leechThreshold: preferences.leechThreshold.unwrap().optional(),
  leechAction: preferences.leechAction.unwrap().optional(),
  newGatherOrder: preferences.newGatherOrder.unwrap().optional(),
  newSortOrder: preferences.newSortOrder.unwrap().optional(),
  newReviewOrder: preferences.newReviewOrder.unwrap().optional(),
  interdayReviewOrder: preferences.interdayReviewOrder.unwrap().optional(),
  reviewSortOrder: preferences.reviewSortOrder.unwrap().optional(),
});
export type DeckReviewSettings = z.infer<typeof deckReviewSettingsSchema>;

export function deckPreferences<T extends SchedulingPreferences>(
  defaults: T,
  overrides: DeckReviewSettings | undefined,
): T {
  return overrides
    ? {
        ...defaults,
        ...overrides,
        dynamicRetention:
          overrides.retention === undefined && defaults.dynamicRetention,
      }
    : defaults;
}

export function cardDeckPreferences(
  defaults: Settings,
  { language, deckId }: Pick<Card, "language" | "deckId">,
  overrides?: DeckReviewSettings,
) {
  return deckPreferences(
    defaults,
    deckId === null ? defaults.minedReviewSettings[language] : overrides,
  );
}
