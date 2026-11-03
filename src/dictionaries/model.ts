import { z } from "zod";
import type { OccurrenceGrammar } from "@/languages/analysis";

export const dictionaryId = (title: string, language: string, target: string) =>
  JSON.stringify([title, language, target]);

export const indexSchema = z.object({
  title: z.string().min(1),
  format: z.literal(3),
  revision: z.string().min(1),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  author: z.string().optional(),
  attribution: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  isUpdatable: z.boolean().optional(),
  indexUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
});

export type DictionaryIndex = z.infer<typeof indexSchema>;

export type Dictionary = {
  id: string;
  revisionId: string;
  index: DictionaryIndex;
  language: string;
  target: string;
  enabled: boolean;
  order: number;
  count: number;
  frequencyCount: number;
  maxFrequency: number;
  imported: number;
  styles: string;
};

export const definitionSchema = z.union([
  z.string(),
  z.tuple([z.string(), z.array(z.string())]),
  z.object({ type: z.enum(["structured-content", "image", "text"]) }).loose(),
]);

export type Definition = z.infer<typeof definitionSchema>;

export const termSchema = z.tuple([
  z.string().min(1),
  z.string(),
  z.string(),
  z.string(),
  z.number().finite(),
  z.array(definitionSchema),
  z.number().finite(),
  z.string(),
]);

export type Entry = {
  id: string;
  revisionId: string;
  key: string;
  folded: string;
  reading: string;
  tags: string;
  definitions: Definition[];
  sequence: number;
};

export type EntryMatch = Omit<Entry, "sequence" | "definitions"> & {
  definitions: [string, string[]][];
  defined: boolean;
};

export function entryMatch(entry: Entry): EntryMatch {
  return {
    id: entry.id,
    revisionId: entry.revisionId,
    key: entry.key,
    folded: entry.folded,
    reading: entry.reading,
    tags: entry.tags,
    definitions: entry.definitions.filter(
      (definition): definition is [string, string[]] =>
        Array.isArray(definition),
    ),
    defined: entry.definitions.some((definition) => !Array.isArray(definition)),
  };
}

const frequencyValueSchema = z.union([
  z.number().finite().nonnegative(),
  z.string(),
  z.object({
    value: z.number().finite().nonnegative(),
    displayValue: z.string().optional(),
  }),
]);

export const frequencyDataSchema = z.union([
  frequencyValueSchema,
  z.object({ reading: z.string(), frequency: frequencyValueSchema }),
]);

export const termMetaSchema = z.tuple([
  z.string().min(1),
  z.enum(["freq", "pitch", "ipa"]),
  z.unknown(),
]);

export type Frequency = {
  id: string;
  revisionId: string;
  key: string;
  folded: string;
  reading: string | null;
  rank: number;
};

export type Tag = {
  id: string;
  revisionId: string;
  name: string;
  category: string;
  description: string;
};

export type DictionaryMedia = {
  id: string;
  revisionId: string;
  path: string;
  blob: Blob;
};

export type Phrase = {
  id: string;
  revisionId: string;
  first: string;
  text: string;
};

export const meaningSchema = z.object({
  dictionaryId: z.string(),
  title: z.string(),
  revision: z.string(),
  attribution: z.string(),
  sourceUrl: z.string(),
  tags: z.string(),
  definitions: z.array(definitionSchema),
  customDefinitions: z.array(z.string()).optional(),
  tagDescriptions: z.record(z.string(), z.string()).optional(),
  grammar: z
    .array(z.object({ text: z.string(), title: z.string().optional() }))
    .optional(),
});

export type Meaning = z.infer<typeof meaningSchema>;

export function meaningTags(meaning: Meaning): string[] {
  return meaning.dictionaryId === "nechybujte"
    ? [meaning.tags].filter(Boolean)
    : meaning.tags.split(/\s+/u).filter(Boolean);
}

export type LookupWord = {
  id: string;
  lemma: string;
  reading: string;
  language: string;
  meanings: Meaning[];
  forms: string[];
};

export type LookupResult = {
  words: LookupWord[];
  unresolved: string[];
  warning?: string;
  onlinePending?: boolean;
  grammar?: OccurrenceGrammar;
};
