import { audioInfoSchema, type AudioInfo } from "@/audio/model";
import { z } from "zod";
export const requests = [
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
export type Responses = { audio: AudioInfo | null; audioSources: AudioInfo[] };
