import { z } from "zod";

export const audioPreferencesSchema = z.object({
  audioDownloads: z.boolean().default(false),
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
  autoplay: z.boolean().default(false),
});
export type AudioPreferences = z.infer<typeof audioPreferencesSchema>;
