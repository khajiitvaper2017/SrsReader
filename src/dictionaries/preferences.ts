import { z } from "zod";

export const dictionariesPreferencesSchema = z.object({
  dictionaryPreferences: z
    .record(
      z.string(),
      z.object({
        enabled: z.boolean(),
        order: z.number().int(),
        fallback: z.boolean().default(false),
      }),
    )
    .default({}),
});
export type DictionariesPreferences = z.infer<
  typeof dictionariesPreferencesSchema
>;
