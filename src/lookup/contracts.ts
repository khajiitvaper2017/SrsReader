import { selection } from "@/vocabulary/contracts";
import type { LookupPage } from "@/lookup/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("createSession"),
    ...selection,
    refineContext: z.boolean().optional(),
  }),
  z.object({ action: z.literal("session"), id: z.string() }),
  z.object({ action: z.literal("closeLookup") }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  createSession: string;
  closeLookup: void;
  session: LookupPage;
};
