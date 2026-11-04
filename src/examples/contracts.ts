import type { ExamplesResult } from "@/examples/model";
import { selection } from "@/vocabulary/contracts";
import { languageSchema } from "@/languages/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("examples"),
    language: languageSchema,
    lemma: selection.term,
    surface: selection.term,
  }),
  z.object({ action: z.literal("exampleCorpus"), language: languageSchema }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type Responses = {
  examples: ExamplesResult;
  exampleCorpus: { count: number; installed: boolean };
};
