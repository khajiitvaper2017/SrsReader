import type { DictionaryScanTiming, ScanSpan } from "@/reader/scan";
import { languageSchema } from "@/languages/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("scan"),
    language: languageSchema,
    lookup: z.boolean(),
    session: z.string(),
    texts: z.array(z.string()),
  }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type ScanResult = {
  language: string;
  spans: ScanSpan[];
  retryAt?: number;
};
type ScanTiming = DictionaryScanTiming & {
  workerMs: number;
  udpipeMs: number;
  udpipeHttpWorkMs: number;
  udpipeRequests: number;
  udpipeCacheHits: number;
  udpipeSharedChunks: number;
  udpipeFallbackBlocks: number;
  dictionaryMs: number;
  storageMs: number;
};
export type Responses = {
  scan: { results: ScanResult[]; timing?: ScanTiming };
};
