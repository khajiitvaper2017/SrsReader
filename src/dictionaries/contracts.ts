import type { Dictionary, LookupResult } from "@/dictionaries/model";
import { selection } from "@/vocabulary/contracts";
import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("dictionaries") }),
  z.object({
    action: z.literal("setDictionary"),
    id: z.string(),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("moveDictionary"),
    id: z.string(),
    direction: z.enum(["up", "down"]),
  }),
  z.object({ action: z.literal("deleteDictionary"), id: z.string() }),
  z.object({
    action: z.literal("lookup"),
    term: selection.term,
    occurrence: selection.occurrence,
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  dictionaries: Dictionary[];
  setDictionary: void;
  moveDictionary: void;
  deleteDictionary: void;
  lookup: LookupResult;
};
