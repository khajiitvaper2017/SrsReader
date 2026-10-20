import type { ScanSpan } from "@/dictionaries/lookup";
import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("scan"), text: z.string().max(30000) }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = { scan: ScanSpan[] };
