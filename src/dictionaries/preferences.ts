import { z } from "zod";

const preferenceSchema = z.object({
  enabled: z.boolean(),
  order: z.number().int(),
  fallback: z.boolean().default(false),
});

export const dictionariesPreferencesSchema = z.object({
  dictionaryPreferences: z.record(z.string(), preferenceSchema).default({}),
  frequencyPreferences: z
    .record(z.string(), preferenceSchema.omit({ fallback: true }))
    .default({}),
});
