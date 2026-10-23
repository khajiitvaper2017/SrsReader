import type { ScanSpan } from "@/reader/scan";
import { languageSchema } from "@/languages/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("scan"),
    language: languageSchema,
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
export type Responses = { scan: ScanResult[] };
