import { z } from "zod";
import { inputPreventionSchema, lookupBindingSchema } from "./controls";
import { supportedLanguages } from "./languages";

export const normalize = (text: string) => text.normalize("NFC");
export const folded = (text: string, language: string) =>
  normalize(text).toLocaleLowerCase(language);
export const wordId = (language: string, lemma: string, reading: string) =>
  JSON.stringify([language, normalize(lemma), normalize(reading)]);
export const dictionaryId = (title: string, language: string, target: string) =>
  JSON.stringify([title, language, target]);

export const settingsSchema = z.object({
  language: z
    .enum(supportedLanguages.map((language) => language.code))
    .default(supportedLanguages[0].code),
  setupComplete: z.boolean().default(false),
  lookupBindings: z.array(lookupBindingSchema).default([]),
  preventMiddleMouse: inputPreventionSchema,
  preventBackForward: inputPreventionSchema,
  paused: z.boolean().default(false),
  disabledHosts: z.array(z.string()).default([]),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  hideDictionarySources: z.boolean().default(true),
  front: z.enum(["word", "sentence"]).default("word"),
  retention: z.number().min(0.7).max(0.99).default(0.9),
  onlyAgainGood: z.boolean().default(true),
  newLimit: z.number().int().min(0).max(10000).default(20),
  missingFrequency: z.enum(["last", "random"]).default("last"),
  audioDownloads: z.boolean().default(false),
  voice: z.string().default(""),
  autoplay: z.boolean().default(false),
  dictionaryPreferences: z
    .record(
      z.string(),
      z.object({ enabled: z.boolean(), order: z.number().int() }),
    )
    .default({}),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = settingsSchema.parse({});

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

export const contextSchema = z
  .object({
    sentence: z.string(),
    surface: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    url: z.string(),
    title: z.string(),
    mined: z.number().finite(),
  })
  .refine(
    (c) =>
      c.end >= c.start &&
      c.end <= c.sentence.length &&
      c.sentence.slice(c.start, c.end) === c.surface,
    "Invalid sentence offsets",
  );
export type ReadingContext = z.infer<typeof contextSchema>;
export const meaningSchema = z.object({
  dictionaryId: z.string(),
  title: z.string(),
  revision: z.string(),
  attribution: z.string(),
  sourceUrl: z.string(),
  tags: z.string(),
  definitions: z.array(definitionSchema),
});
export type Meaning = z.infer<typeof meaningSchema>;
export type LookupWord = {
  id: string;
  lemma: string;
  reading: string;
  language: string;
  meanings: Meaning[];
  forms: string[];
};
export type LookupResult = { words: LookupWord[]; unresolved: string[] };

export const scheduleSchema = z.object({
  due: z.number().finite(),
  stability: z.number().finite().nonnegative(),
  difficulty: z.number().finite().nonnegative(),
  elapsed_days: z.number().finite().nonnegative(),
  scheduled_days: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  last_review: z.number().finite().nullable(),
});
export type Schedule = z.infer<typeof scheduleSchema>;
export const vocabularySchema = z.object({
  id: z.string(),
  language: z.string(),
  lemma: z.string().min(1),
  reading: z.string(),
  meanings: z.array(meaningSchema),
  contexts: z.array(contextSchema),
  known: z.boolean(),
  suspended: z.boolean(),
  card: scheduleSchema.nullable(),
  version: z.number().int().nonnegative(),
  created: z.number().finite(),
  updated: z.number().finite(),
});
export type Vocabulary = z.infer<typeof vocabularySchema>;
export const reviewSchema = z.object({
  id: z.string(),
  wordId: z.string(),
  time: z.number().finite(),
  rating: z.number().int().min(1).max(4),
  source: z.enum(["reading", "review"]),
  before: vocabularySchema.nullable(),
  afterVersion: z.number().int(),
  log: z.record(
    z.string(),
    z.union([z.number().finite(), z.string(), z.null()]),
  ),
  scheduler: z.literal("ts-fsrs@5.4.2/FSRS-6"),
  retention: z.number().min(0.7).max(0.99),
});
export type Review = z.infer<typeof reviewSchema>;
export const audioInfoSchema = z.object({
  id: z.string(),
  language: z.string(),
  lemma: z.string(),
  url: z.url(),
  page: z.url(),
  creator: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  name: z.string(),
});
export type AudioInfo = z.infer<typeof audioInfoSchema>;
export type AudioRecord = AudioInfo & { blob: Blob };
export type WordState = "unknown" | "learning" | "due" | "known" | "suspended";
export function stateOf(word?: Vocabulary): WordState {
  if (!word) return "unknown";
  if (word.known) return "known";
  if (word.suspended) return "suspended";
  if (!word.card) return "unknown";
  if (word.card && word.card.due <= Date.now()) return "due";
  return "learning";
}

export function httpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new Error("A secure HTTPS URL is required.");
  return url.href;
}
