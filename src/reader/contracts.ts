import type { DictionaryScanTiming, ScanSpan } from "@/reader/scan";
import { languageSchema } from "@/languages/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("scan"),
    language: languageSchema,
    source: z.enum(["website", "popup"]),
    lookup: z.boolean(),
    session: z.string(),
    texts: z.array(z.string()),
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type ScanResult = {
  language: string;
  spans: ScanSpan[];
  retryAt?: number;
};
export type ScanTiming = DictionaryScanTiming & {
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
