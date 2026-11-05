import { audioInfoSchema, type AudioInfo } from "@/audio/model";
import { audioPreferencesSchema } from "@/audio/preferences";
import type { Settings } from "@/settings/model";
import { z } from "zod";

const pronunciationForm = z.string().trim().min(1).max(1000).optional();

export const requests = [
  z.object({
    action: z.literal("setAudioSources"),
    sources: audioPreferencesSchema.shape.audioSources.unwrap(),
  }),
  z.object({
    action: z.literal("audioSources"),
    id: z.string(),
    form: pronunciationForm,
  }),
  z.object({
    action: z.literal("audio"),
    id: z.string(),
    download: z.boolean(),
    source: audioInfoSchema.optional(),
    form: pronunciationForm,
  }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type Responses = {
  audio: AudioInfo | null;
  audioSources: AudioInfo[];
  setAudioSources: Settings;
};
