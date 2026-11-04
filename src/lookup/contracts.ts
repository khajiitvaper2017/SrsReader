import { occurrenceSchema, type OccurrenceGrammar } from "@/languages/analysis";
import { contextSchema } from "@/vocabulary/model";
import { selection } from "@/vocabulary/contracts";
import type { LookupPage } from "@/lookup/model";
import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("createSession"),
    ...selection,
    compound: z
      .object({
        term: selection.term,
        context: contextSchema,
        occurrence: selection.occurrence,
      })
      .optional(),
    refineContext: z.boolean().optional(),
  }),
  z.object({ action: z.literal("session"), id: z.string() }),
  z.object({ action: z.literal("closeLookup") }),
  z.object({
    action: z.literal("compoundGrammar"),
    surface: selection.term,
    occurrence: occurrenceSchema,
  }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type Responses = {
  createSession: string;
  closeLookup: void;
  compoundGrammar: OccurrenceGrammar | undefined;
  session: LookupPage;
};
