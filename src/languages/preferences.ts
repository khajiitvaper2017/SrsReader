import { systemLanguage } from "@/languages/codes";
import { languageSchema } from "@/languages/model";
import { interfaceLanguages } from "@/shared/i18n/i18n";
import { z } from "zod";

export const languagesPreferencesSchema = z.object({
  studyLanguage: z.union([z.literal(""), languageSchema]).default(""),
  studyLanguages: z.array(languageSchema).default([]),
  nativeLanguage: languageSchema.default(systemLanguage),
  interfaceLanguage: z.enum(["auto", ...interfaceLanguages]).default("auto"),
});
export type LanguagesPreferences = z.infer<typeof languagesPreferencesSchema>;
