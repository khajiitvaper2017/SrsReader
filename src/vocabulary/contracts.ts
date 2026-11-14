import { translationSchema } from "@/translation/model";
import {
  cardFieldSchema,
  contextSchema,
  type WordWithCards,
} from "@/vocabulary/model";
import { z } from "zod";
import { occurrenceSchema } from "@/languages/analysis";
import { languageSchema } from "@/languages/model";
import type { LookupWord } from "@/dictionaries/model";
import type { Occurrence, OccurrenceGrammar } from "@/languages/analysis";

export const selection = {
  term: z.string().min(1).max(1000),
  context: contextSchema.optional(),
  occurrence: occurrenceSchema.optional(),
};
export const requests = [
  z.object({
    action: z.literal("saveCardFields"),
    id: z.string(),
    noteId: z.string().min(1),
    fields: z.array(cardFieldSchema),
  }),
  z.object({
    action: z.literal("saveCustomTranslation"),
    id: z.string(),
    context: contextSchema,
    language: languageSchema,
    text: z.string().trim().max(30000),
  }),
  z.object({
    action: z.literal("word"),
    id: z.string(),
    context: selection.context,
    occurrence: selection.occurrence,
  }),
  z.object({
    action: z.literal("cardDefinitions"),
    id: z.string(),
    context: selection.context,
  }),
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
    language: languageSchema,
    ...selection,
    term: selection.term.trim().min(1),
    id: z.string().optional(),
    definition: z.string().trim().min(1),
    definitionIndex: z.number().int().nonnegative().optional(),
    dictionaryKey: z.string().optional(),
  }),
  z.object({
    action: z.literal("restoreDefinition"),
    id: z.string(),
    dictionaryKey: z.string(),
  }),
  z.object({
    action: z.literal("dictionaryVisibility"),
    id: z.string(),
    dictionaryId: z.string(),
    view: z.enum(["hidden", "matched", "all"]),
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
    action: z.literal("refreshWord"),
    id: z.string(),
    noteId: z.string().optional(),
  }),
  z.object({
    action: z.literal("selectReadingCard"),
    id: z.string(),
    cardId: z.string(),
  }),
  z.object({
    action: z.literal("words"),
    language: languageSchema.optional(),
    deckId: z.string().optional(),
    query: z.string().max(1000).default(""),
    filter: z
      .enum([
        "all",
        "leeches",
        "known",
        "suspended",
        "new",
        "due",
        "review",
        "learning",
      ])
      .default("all"),
    page: z.number().int().positive().default(1),
  }),
  z.object({
    action: z.literal("retentionOverride"),
    id: z.string(),
    value: z.number().min(0.7).max(0.99).nullable(),
  }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type Responses = {
  saveCardFields: void;
  saveCustomTranslation: void;
  saveTranslation: void;
  word: WordWithCards | undefined;
  cardDefinitions: {
    word: LookupWord;
    saved: WordWithCards;
    grammar?: OccurrenceGrammar;
    occurrence?: Occurrence;
  };
  mine: WordWithCards;
  defineWord: WordWithCards;
  deleteDefinition: void;
  restoreDefinition: void;
  dictionaryVisibility: void;
  known: WordWithCards;
  suspend: void;
  deleteWord: void;
  refreshWord: void;
  selectReadingCard: void;
  words: { words: WordWithCards[]; total: number; page: number };
  retentionOverride: void;
};
