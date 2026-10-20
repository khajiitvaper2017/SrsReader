import { z } from "zod";

export const translationPreferencesSchema = z.object({
  showSentenceTranslation: z.boolean().default(true),
});
export type TranslationPreferences = z.infer<
  typeof translationPreferencesSchema
>;
