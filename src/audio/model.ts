import { z } from "zod";

export const audioInfoSchema = z.object({
  id: z.string(),
  language: z.string(),
  lemma: z.string(),
  url: z.url(),
  page: z.url(),
  creator: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  name: z.string(),
});

export type AudioInfo = z.infer<typeof audioInfoSchema>;

export type AudioRecord = AudioInfo & { blob: Blob };
