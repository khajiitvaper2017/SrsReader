import { translationSchema } from "@/translation/model";
import { contextSchema, type Vocabulary } from "@/vocabulary/model";
import { z } from "zod";
import { occurrenceSchema } from "@/languages/analysis";

export const selection = {
  term: z.string().min(1).max(1000),
  context: contextSchema.optional(),
  occurrence: occurrenceSchema.optional(),
};
export const requests = [
  z.object({ action: z.literal("word"), id: z.string() }),
  z.object({
    action: z.literal("saveTranslation"),
    id: z.string(),
    sentence: z.string(),
    start: z.number().int().nonnegative(),
    translation: translationSchema,
  }),
  z.object({ action: z.literal("mine"), ...selection, id: z.string() }),
  z.object({
    action: z.literal("defineWord"),
    ...selection,
    term: selection.term.trim().min(1),
    id: z.string().optional(),
    definition: z.string().trim().min(1),
    definitionIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("deleteDefinition"),
    id: z.string(),
    definitionIndex: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("known"),
    id: z.string(),
    term: selection.term,
    occurrence: selection.occurrence,
    value: z.boolean(),
  }),
  z.object({
    action: z.literal("suspend"),
    id: z.string(),
    value: z.boolean(),
  }),
  z.object({ action: z.literal("deleteWord"), id: z.string() }),
  z.object({
    action: z.literal("editWord"),
    id: z.string(),
    definition: z.string().min(1).optional(),
  }),
  z.object({ action: z.literal("refreshWord"), id: z.string() }),
  z.object({ action: z.literal("words"), query: z.string().default("") }),
  z.object({
    action: z.literal("retentionOverride"),
    id: z.string(),
    value: z.number().min(0.7).max(0.99).nullable(),
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = {
  saveTranslation: void;
  word: Vocabulary | undefined;
  mine: Vocabulary;
  defineWord: Vocabulary;
  deleteDefinition: void;
  known: Vocabulary;
  suspend: void;
  deleteWord: void;
  editWord: void;
  refreshWord: void;
  words: Vocabulary[];
  retentionOverride: void;
};
