import { languageSchema } from "@/languages/model";
import { z } from "zod";

const preferenceSchema = z.object({
  enabled: z.boolean(),
  order: z.number().int(),
  fallback: z.boolean().default(false),
});

export const dictionariesPreferencesSchema = z.object({
  immersionCollection: z.record(languageSchema, z.boolean()).default({}),
  dictionaryPreferences: z.record(z.string(), preferenceSchema).default({}),
  frequencyPreferences: z.record(z.string(), preferenceSchema).default({}),
});
export type DictionariesPreferences = z.infer<
  typeof dictionariesPreferencesSchema
>;
