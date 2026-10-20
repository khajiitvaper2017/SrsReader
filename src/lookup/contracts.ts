import { selection } from "@/vocabulary/contracts";
import type { ReadingContext } from "@/vocabulary/model";
import type { Occurrence } from "@/languages/analysis";
import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("createSession"), ...selection }),
  z.object({ action: z.literal("session"), id: z.string() }),
  z.object({ action: z.literal("closeLookup") }),
  z.object({
    action: z.literal("resizeLookup"),
    session: z.string(),
    height: z.number().int().min(1).max(460),
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  createSession: string;
  closeLookup: void;
  resizeLookup: void;
  session: { term: string; context?: ReadingContext; occurrence?: Occurrence };
};
