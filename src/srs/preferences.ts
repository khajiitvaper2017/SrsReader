import { t } from "@/shared/i18n/i18n";
import { z } from "zod";

export const learningStepsSchema = z.array(
  z
    .string()
    .regex(/^(?:\d+(?:\.\d+)?|\.\d+)[mhd]$/)
    .refine((step) => parseFloat(step) > 0),
);
export const retentionBandSchema = z.object({
  upTo: z.number().positive().nullable(),
  retention: z.number().min(0.7).max(0.99),
});
export const srsPreferencesSchema = z.object({
  front: z.enum(["word", "sentence"]).default("word"),
  retention: z.number().min(0.7).max(0.99).default(0.8),
  algorithm: z.enum(["fsrs", "rwkv"]).default("fsrs"),
  learningSteps: learningStepsSchema.default(["10m"]),
  relearningSteps: learningStepsSchema.default(["10m"]),
  minimumInterval: z.number().int().min(1).max(36500).default(1),
  rolloverHour: z.number().int().min(0).max(23).default(4),
  learnAheadMinutes: z.number().nonnegative().finite().default(20),
  reviewLimit: z.number().int().positive().nullable().default(null),
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
  newLimit: z.number().int().min(0).max(10000).default(20),
  missingFrequency: z.enum(["last", "random"]).default("last"),
});
export type SchedulingPreferences = z.infer<typeof srsPreferencesSchema>;
