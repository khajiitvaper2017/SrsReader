import type { ScanSpan } from "@/reader/scan";
import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("scan"), texts: z.array(z.string()) }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type ScanResult = { spans: ScanSpan[]; retryAt?: number };
export type Responses = { scan: ScanResult[] };
