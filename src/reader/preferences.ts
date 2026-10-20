import { inputPreventionSchema, lookupBindingSchema } from "@/reader/controls";
import { wordStylesSchema } from "@/settings/word-styles";
import { z } from "zod";

export const readerPreferencesSchema = z.object({
  lookupBindings: z.array(lookupBindingSchema).default([]),
  preventMiddleMouse: inputPreventionSchema,
  preventBackForward: inputPreventionSchema,
  paused: z.boolean().default(false),
  disabledHosts: z.array(z.string()).default([]),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  popupPlacement: z.enum(["auto", "below", "beside"]).default("auto"),
  hideDictionarySources: z.boolean().default(true),
  firstDictionaryOnly: z.boolean().default(true),
  ignoredTags: z.array(z.string()).default([]),
  nechybujte: z.boolean().default(false),
  scanPopups: z.boolean().default(true),
  detectPageLanguage: z.boolean().default(true),
  wordColorsEnabled: z.boolean().default(true),
  wordStyles: wordStylesSchema,
  matureIntervalDays: z.number().int().min(1).default(28),
});
export type ReaderPreferences = z.infer<typeof readerPreferencesSchema>;
