import { z } from "zod";
import { audioInfoSchema } from "@/audio/model";
import {
  definitionSchema,
  indexSchema,
  meaningSchema,
} from "@/dictionaries/model";
import {
  immersionWordSchema,
  immersionPassageSchema,
} from "@/dictionaries/immersion-model";
import { sentenceSchema } from "@/examples/sentence-model";
import { settingsSchema } from "@/settings/model";
import { deckSchema } from "@/srs/deck-model";
import { reviewSchema } from "@/srs/history";
import { vocabularySchema, wordId } from "@/vocabulary/model";

const number = z.number().finite();
const count = number.int().nonnegative();
const id = z.string();
const blob = z.instanceof(Blob);
const globalFeatures = z.object({
  firstDay: number.nullable(),
  previousDay: number.nullable(),
  reviews: count,
  newCards: count,
  today: number.nullable(),
  todayNew: count,
  todayReviews: count,
});
const cardFeatures = z.object({
  lastTime: number,
  lastDay: number,
  firstDay: number,
  sumDays: number,
  sumSeconds: number,
  lastReviewIndex: number,
  lastNewCount: number,
});
const layers = z.discriminatedUnion("compact", [
  z.object({
    compact: z.literal(true),
    layers: z.array(
      z.object({
        shift: z.instanceof(Uint16Array),
        scales: z.instanceof(Float32Array),
        codes: z.instanceof(Int8Array),
        channel: z.instanceof(Uint16Array).optional(),
      }),
    ),
  }),
  z.object({
    compact: z.literal(false),
    layers: z.array(
      z.object({
        shift: z.instanceof(Float32Array),
        matrix: z.instanceof(Float32Array),
        channel: z.instanceof(Float32Array).optional(),
      }),
    ),
  }),
]);
const entity = z.object({ id, state: layers });
const card = z.object({
  id,
  features: cardFeatures,
  curve: z.object({
    w: z.instanceof(Float32Array),
    s: z.instanceof(Float32Array),
    d: z.instanceof(Float32Array),
  }),
});
const meta = z.object({
  id,
  key: z.string(),
  cursor: count,
  features: globalFeatures,
});
const lookup = z.object({
  words: z.array(
    z.object({
      id,
      lemma: z.string(),
      language: z.string(),
      reading: z.string(),
      meanings: z.array(meaningSchema),
      forms: z.array(z.string()),
    }),
  ),
  unresolved: z.array(z.string()),
});
const entry = z.object({
  id,
  revisionId: id,
  key: z.string(),
  folded: z.string(),
  reading: z.string(),
  tags: z.string(),
  definitions: z.array(definitionSchema),
});
const corpus = z.object({ language: z.string(), count, updated: number });

// Validate decoded rows without transforming them: full backups preserve stored
// values, optional fields, binary data and scheduler state exactly.
export const fullRowSchemas: Record<string, z.ZodType> = {
  settings: z.object({ id: z.literal("main"), value: settingsSchema }),
  vocabulary: vocabularySchema.refine(
    (word) => word.id === wordId(word.language, word.lemma, word.reading),
  ),
  reviews: reviewSchema.refine(
    (review) => !review.before || review.before.id === review.wordId,
  ),
  decks: deckSchema,
  sentences: sentenceSchema,
  audio: audioInfoSchema.extend({ blob }),
  dictionaries: z.object({
    id,
    revisionId: id,
    index: indexSchema,
    language: z.string(),
    target: z.string(),
    enabled: z.boolean(),
    order: number,
    count,
    frequencyCount: count,
    maxFrequency: number,
    imported: number,
    styles: z.string(),
    immersion: z.object({ secondaryWeight: number.min(0).max(1) }).optional(),
  }),
  entries: entry.extend({ sequence: number }),
  entryMatches: entry.extend({ defined: z.boolean() }),
  frequencies: z.object({
    id,
    revisionId: id,
    key: z.string(),
    folded: z.string(),
    reading: z.string().nullable(),
    rank: number,
  }),
  tags: z.object({
    id,
    revisionId: id,
    name: z.string(),
    category: z.string(),
    description: z.string(),
  }),
  phrases: z.object({
    id,
    revisionId: id,
    first: z.string(),
    text: z.string(),
  }),
  dictionaryMedia: z.object({ id, revisionId: id, path: z.string(), blob }),
  archives: z.object({ id, blob }),
  exampleCorpora: corpus.extend({ corpus: blob }),
  morphology: corpus.extend({ data: blob }),
  nechybujte: z.object({ term: z.string(), result: lookup }),
  spanishdict: z.object({ term: z.string(), result: lookup }),
  immersionWords: immersionWordSchema,
  immersionPassages: immersionPassageSchema,
  analyses: z.object({
    key: z.string(),
    text: z.string(),
    language: z.string().optional(),
    analysis: z
      .object({
        sentences: z.array(z.unknown()),
        surfaces: z.array(z.unknown()),
      })
      .optional(),
    retryAt: number.optional(),
  }),
  rwkvEntities: entity,
  rwkvCards: card,
  rwkvMeta: meta,
  srsMeta: z.object({
    id: z.literal("main"),
    sequence: count,
    scheduledModel: z.string().optional(),
    reschedule: z
      .object({ model: z.string(), after: z.string(), count })
      .optional(),
    undo: z
      .object({
        reviewId: id,
        entities: z.array(entity),
        card: card.optional(),
        meta,
      })
      .optional(),
  }),
};

export const isModelCache = (name: string) =>
  name === "translation-models" || /^srs-reader-rwkv-[a-z0-9-]+$/.test(name);
const cacheEntry = z.object({
  cache: z.string().refine(isModelCache),
  url: z.url().refine((url) => /^https?:\/\//.test(url)),
  path: z.string().regex(/^models\/\d+$/),
  headers: z.array(z.tuple([z.string(), z.string()])),
});
export const fullManifestSchema = z.object({
  format: z.literal("srs-reader-full"),
  version: z.literal(1),
  databaseVersion: count.positive(),
  databaseBytes: count.positive(),
  created: z.string().datetime(),
  caches: z.array(cacheEntry),
});
export type FullManifest = z.infer<typeof fullManifestSchema>;
