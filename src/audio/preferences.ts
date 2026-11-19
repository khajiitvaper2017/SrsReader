import { z } from "zod";

export const audioDialectSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}(?:-[\p{L}\p{M}\p{N}]+(?:[ -][\p{L}\p{M}\p{N}]+)*)?$/u);

// Wikimedia filename prefixes are open-ended; these are verified examples.
export const audioDialectSuggestions: Record<string, string[]> = {
  de: ["at"],
  en: ["us", "uk", "gb", "au", "ca", "nz", "ie", "za", "sa"],
  es: ["ar", "mx", "us", "chile"],
  fr: ["fr", "ca", "be", "be-bw", "paris"],
  lv: ["riga"],
  pt: ["br"],
};

export const audioPreferencesSchema = z.object({
  audioDialects: z.record(z.string(), z.array(audioDialectSchema)).default({}),
  audioSources: z
    .array(
      z.object({
        type: z.enum(["commons", "languagePod101", "forvo"]),
        enabled: z.boolean(),
      }),
    )
    .default([
      { type: "commons", enabled: true },
      { type: "languagePod101", enabled: true },
      { type: "forvo", enabled: true },
    ]),
  normalizeAudio: z.boolean().default(true),
  voice: z.string().default(""),
  autoplayLookup: z.boolean().default(false),
});
export type AudioPreferences = z.infer<typeof audioPreferencesSchema>;
