import { z } from "zod";

export const audioPreferencesSchema = z.object({
  audioDownloads: z.boolean().default(false),
  normalizeAudio: z.boolean().default(true),
  voice: z.string().default(""),
  autoplay: z.boolean().default(false),
});
export type AudioPreferences = z.infer<typeof audioPreferencesSchema>;
