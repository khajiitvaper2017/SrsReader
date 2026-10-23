import { audioInfoSchema, type AudioInfo } from "@/audio/model";
import { audioPreferencesSchema } from "@/audio/preferences";
import type { Settings } from "@/settings/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("setAudioSources"),
    sources: audioPreferencesSchema.shape.audioSources.unwrap(),
  }),
  z.object({ action: z.literal("audioSources"), id: z.string() }),
  z.object({
    action: z.literal("audio"),
    id: z.string(),
    download: z.boolean(),
    source: audioInfoSchema.optional(),
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  audio: AudioInfo | null;
  audioSources: AudioInfo[];
  setAudioSources: Settings;
};
