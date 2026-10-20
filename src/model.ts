import { t, interfaceLanguages } from "./i18n";
import { z } from "zod";
import { inputPreventionSchema, lookupBindingSchema } from "./controls";
import { languageCode, systemLanguage } from "./languages";
import { wordStylesSchema, type WordState } from "./word-styles";
export type { WordState } from "./word-styles";

export const normalize = (text: string) => text.normalize("NFC");
export const folded = (text: string, language: string) =>
  normalize(text).toLocaleLowerCase(language);
export const wordId = (language: string, lemma: string, reading: string) =>
  JSON.stringify([language, normalize(lemma), normalize(reading)]);
export const dictionaryId = (title: string, language: string, target: string) =>
  JSON.stringify([title, language, target]);

export const languageSchema = z.string().transform((value, ctx) => {
  try {
    return languageCode(value);
  } catch {
    ctx.addIssue({ code: "custom", message: t("enter_a_valid_language_code") });
    return z.NEVER;
  }
});
export const learningStepsSchema = z.array(
  z
    .string()
    .regex(/^(?:\d+(?:\.\d+)?|\.\d+)[mhd]$/)
    .refine((step) => parseFloat(step) > 0),
);
export const retentionBandSchema = z.object({
  upTo: z.number().positive().nullable(),
  retention: z.number().min(0.7).max(0.99),
});
export const settingsSchema = z
  .object({
    studyLanguage: z.union([z.literal(""), languageSchema]).default(""),
    setupComplete: z.boolean().default(false),
    lookupBindings: z.array(lookupBindingSchema).default([]),
    preventMiddleMouse: inputPreventionSchema,
    preventBackForward: inputPreventionSchema,
    paused: z.boolean().default(false),
    disabledHosts: z.array(z.string()).default([]),
    theme: z.enum(["system", "light", "dark"]).default("system"),
    popupPlacement: z.enum(["auto", "below", "beside"]).default("auto"),
    hideDictionarySources: z.boolean().default(true),
    firstDictionaryOnly: z.boolean().default(true),
    ignoredTags: z.array(z.string()).default([]),
    nechybujte: z.boolean().default(false),
    scanPopups: z.boolean().default(true),
    detectPageLanguage: z.boolean().default(true),
    nativeLanguage: languageSchema.default(systemLanguage),
    interfaceLanguage: z.enum(["auto", ...interfaceLanguages]).default("auto"),
    showSentenceTranslation: z.boolean().default(true),
    wordColorsEnabled: z.boolean().default(true),
    wordStyles: wordStylesSchema,
    front: z.enum(["word", "sentence"]).default("word"),
    matureIntervalDays: z.number().int().min(1).default(28),
    retention: z.number().min(0.7).max(0.99).default(0.8),
    algorithm: z.enum(["fsrs", "rwkv"]).default("fsrs"),
    learningSteps: learningStepsSchema.default(["10m"]),
    relearningSteps: learningStepsSchema.default(["10m"]),
    minimumInterval: z.number().int().min(1).max(36500).default(1),
    rolloverHour: z.number().int().min(0).max(23).default(4),
    learnAheadMinutes: z.number().nonnegative().finite().default(20),
    reviewLimit: z.number().int().positive().nullable().default(null),
    leechThreshold: z.number().int().nonnegative().default(8),
    leechAction: z.enum(["suspend", "mark"]).default("suspend"),
    intervalFuzz: z.boolean().default(false),
    dynamicRetention: z.boolean().default(false),
    retentionBands: z
      .array(retentionBandSchema)
      .min(1)
      .refine(
        (bands) =>
          bands.at(-1)?.upTo === null &&
          bands.every(
            (band, index) =>
              index === bands.length - 1 ||
              (band.upTo !== null &&
                (index === 0 ||
                  band.upTo > (bands[index - 1]!.upTo ?? Infinity))),
          ),
        t("srs_invalid_bands"),
      )
      .default([
        { upTo: 1000, retention: 0.9 },
        { upTo: 5000, retention: 0.85 },
        { upTo: 20000, retention: 0.8 },
        { upTo: null, retention: 0.75 },
      ]),
    rankSources: z.record(z.string(), z.boolean()).default({}),
    onlyAgainGood: z.boolean().default(false),
    newLimit: z.number().int().min(0).max(10000).default(20),
    missingFrequency: z.enum(["last", "random"]).default("last"),
    audioDownloads: z.boolean().default(false),
    normalizeAudio: z.boolean().default(true),
    voice: z.string().default(""),
    autoplay: z.boolean().default(false),
    dictionaryPreferences: z
      .record(
        z.string(),
        z.object({ enabled: z.boolean(), order: z.number().int() }),
      )
      .default({}),
  })
  .transform((settings) => ({
    ...settings,
    setupComplete: settings.setupComplete && !!settings.studyLanguage,
  }));
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

export const translationSchema = z.object({
  text: z.string().min(1).max(30000),
  language: languageSchema,
});
export const contextSchema = z
  .object({
    sentence: z.string(),
    surface: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    url: z.string(),
    title: z.string(),
    mined: z.number().finite(),
    translation: translationSchema.optional(),
  })
  .refine(
    (c) =>
      c.end >= c.start &&
      c.end <= c.sentence.length &&
      c.sentence.slice(c.start, c.end) === c.surface,
    { error: () => t("invalid_sentence_offsets") },
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
};

const legacyScheduleSchema = z.object({
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
const commonScheduleSchema = z.object({
  due: z.number().finite(),
  scheduled_days: z.number().finite().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  learning_steps: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  last_review: z.number().finite().nullable(),
  last_review_day: z.number().int().nullable().default(null),
  interday: z.boolean(),
  fsrs: z.object({
    stability: z.number().finite().nonnegative(),
    difficulty: z.number().finite().nonnegative(),
  }),
});
export const scheduleSchema = z.union([
  commonScheduleSchema,
  legacyScheduleSchema.transform((card) => ({
    due: card.due,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review,
    last_review_day: null,
    interday:
      (card.state === 1 || card.state === 3) && card.scheduled_days >= 1,
    fsrs: { stability: card.stability, difficulty: card.difficulty },
  })),
]);
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
  srsVersion: z.number().int().nonnegative().default(0),
  leech: z.boolean().default(false),
  retentionOverride: z.number().min(0.7).max(0.99).nullable().default(null),
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
  scheduler: z.enum(["ts-fsrs@5.4.2/FSRS-6", "rwkv-sm40v2-w8-s8"]),
  sequence: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
  durationMs: z.number().finite().nonnegative().nullable().default(null),
  after: scheduleSchema.nullable().default(null),
  afterSrsVersion: z.number().int().nonnegative().default(0),
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
export function stateOf(
  word: Vocabulary | undefined,
  matureIntervalDays: number,
): WordState {
  if (!word) return "unknown";
  if (word.known) return "known";
  if (word.suspended) return "suspended";
  if (!word.card || word.card.state === 0) return "new";
  if (word.card.due <= Date.now()) return "due";
  return word.card.scheduled_days >= matureIntervalDays ? "review" : "learning";
}

export function httpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(t("secure_url_required"));
  return url.href;
}
