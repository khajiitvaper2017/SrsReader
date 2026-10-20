import { selection } from "@/vocabulary/contracts";
import type { ExamplesResult } from "@/vocabulary/examples/query";
import { z } from "zod";
export const requests = [
  z.object({
    action: z.literal("examples"),
    lemma: selection.term,
    surface: selection.term,
  }),
  z.object({ action: z.literal("exampleCorpus") }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  examples: ExamplesResult;
  exampleCorpus: { count: number; installed: boolean };
};
