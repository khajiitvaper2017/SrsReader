import { z } from "zod";

export const backgroundTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "video/webm",
  "video/mp4",
  "video/ogg",
] as const;
export const sentenceAudioTypes = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/webm",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
] as const;

export const cardMediaId = (
  wordId: string,
  kind: "background" | "wordAudio" | "audio",
  sentence = "",
) => JSON.stringify([wordId, kind, kind === "audio" ? sentence : ""]);

export const cardMediaInfoSchema = z
  .object({
    id: z.string(),
    wordId: z.string(),
    kind: z.enum(["background", "wordAudio", "audio"]),
    sentence: z.string(),
    name: z.string(),
    mime: z.enum([...backgroundTypes, ...sentenceAudioTypes]),
  })
  .refine(
    (item) =>
      item.id === cardMediaId(item.wordId, item.kind, item.sentence) &&
      (item.kind === "background"
        ? item.sentence === "" &&
          backgroundTypes.some((type) => type === item.mime)
        : (item.kind === "audio"
            ? item.sentence.length > 0
            : item.sentence === "") &&
          sentenceAudioTypes.some((type) => type === item.mime)),
  );
export const cardMediaSchema = cardMediaInfoSchema.safeExtend({
  blob: z.instanceof(Blob),
});
export type CardMedia = z.infer<typeof cardMediaSchema>;
