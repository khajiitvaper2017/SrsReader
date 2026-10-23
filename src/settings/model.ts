import { audioPreferencesSchema } from "@/audio/preferences";
import { dictionariesPreferencesSchema } from "@/dictionaries/preferences";
import { languagesPreferencesSchema } from "@/languages/preferences";
import { readerPreferencesSchema } from "@/reader/preferences";
import { srsPreferencesSchema } from "@/srs/preferences";
import { translationPreferencesSchema } from "@/translation/preferences";
import { z } from "zod";

export const settingsSchema = z
  .object({
    ...srsPreferencesSchema.shape,
    ...readerPreferencesSchema.shape,
    ...audioPreferencesSchema.shape,
    ...languagesPreferencesSchema.shape,
    ...translationPreferencesSchema.shape,
    ...dictionariesPreferencesSchema.shape,
    setupComplete: z.boolean().default(false),
  })
  .transform((settings) => ({
    ...settings,
    studyLanguages: [
      ...new Set([
        ...settings.studyLanguages,
        ...(settings.studyLanguage ? [settings.studyLanguage] : []),
      ]),
    ],
    setupComplete: settings.setupComplete && !!settings.studyLanguage,
  }));

export type Settings = z.infer<typeof settingsSchema>;

export const defaults = settingsSchema.parse({});
