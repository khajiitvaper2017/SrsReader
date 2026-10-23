import { z } from "zod";

export const translationPreferencesSchema = z.object({
  autoTranslateSentences: z.boolean().default(false),
  autoTranslateDefinitions: z.boolean().default(false),
  showSentenceTranslation: z.boolean().default(true),
});
export type TranslationPreferences = z.infer<
  typeof translationPreferencesSchema
>;
