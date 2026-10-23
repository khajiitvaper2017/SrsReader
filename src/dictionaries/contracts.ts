import { immersionWeightSchema } from "@/dictionaries/immersion-model";
import type { Dictionary, LookupResult, Meaning } from "@/dictionaries/model";
import { languageSchema } from "@/languages/model";
import { selection } from "@/vocabulary/contracts";
import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("addImmersion"), language: languageSchema }),
  z.object({
    action: z.literal("setImmersionWeight"),
    id: z.string(),
    weight: immersionWeightSchema,
  }),
  z.object({ action: z.literal("dictionaries") }),
  z.object({
    action: z.literal("searchDictionaries"),
    query: z.string().trim().min(1).max(500),
    language: languageSchema,
    mode: z.enum(["word", "definition"]),
    offset: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("setDictionary"),
    role: z.enum(["vocabulary", "frequency"]),
    id: z.string(),
    display: z.enum(["show", "fallback", "hide"]),
  }),
  z.object({
    action: z.literal("moveDictionary"),
    role: z.enum(["vocabulary", "frequency"]),
    id: z.string(),
    target: z.string(),
  }),
  z.object({ action: z.literal("deleteDictionary"), id: z.string() }),
  z.object({
    action: z.literal("lookup"),
    language: languageSchema,
    term: selection.term,
    occurrence: selection.occurrence,
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  addImmersion: void;
  setImmersionWeight: void;
  dictionaries: Dictionary[];
  searchDictionaries: {
    entries: { id: string; key: string; reading: string; meaning: Meaning }[];
    hasMore: boolean;
  };
  setDictionary: void;
  moveDictionary: void;
  deleteDictionary: void;
  lookup: LookupResult;
};
