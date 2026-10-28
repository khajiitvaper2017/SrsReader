import { systemLanguage } from "@/languages/codes";
import { languageSchema } from "@/languages/model";
import { interfaceLanguages } from "@/shared/i18n/i18n";
import { z } from "zod";

export const languagesPreferencesSchema = z.object({
  studyLanguages: z.array(languageSchema).default([]),
  nativeLanguages: z
    .array(languageSchema)
    .min(1)
    .default(() => [systemLanguage()]),
  interfaceLanguage: z.enum(["auto", ...interfaceLanguages]).default("auto"),
});
export type LanguagesPreferences = z.infer<typeof languagesPreferencesSchema>;
