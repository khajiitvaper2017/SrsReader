import { z } from "zod";
import { scheduleSchema } from "@/srs/model";
import { contextSchema } from "@/vocabulary/model";

const fieldDefinitionSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
});
export const fieldBindingsSchema = z.object({
  word: z.number().int().nonnegative().optional(),
  reading: z.number().int().nonnegative().optional(),
  definitions: z.number().int().nonnegative().optional(),
  sentence: z.number().int().nonnegative().optional(),
  sentenceFurigana: z.number().int().nonnegative().optional(),
  translation: z.number().int().nonnegative().optional(),
  wordAudio: z.number().int().nonnegative().optional(),
  sentenceAudio: z.number().int().nonnegative().optional(),
  image: z.number().int().nonnegative().optional(),
});
export const noteTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["standard", "cloze"]),
  fields: z.array(fieldDefinitionSchema),
  templates: z
    .array(z.object({ name: z.string(), front: z.string(), back: z.string() }))
    .min(1),
  css: z.string(),
  bindings: fieldBindingsSchema,
  created: z.number().finite(),
  sourceId: z.string().optional(),
  source: z.record(z.string(), z.unknown()).optional(),
});
const cardEncounterSchema = z.object({
  context: contextSchema,
  pos: z.string(),
  feats: z.record(z.string(), z.string()),
});
export type CardEncounter = z.infer<typeof cardEncounterSchema>;
export const noteSchema = z.object({
  id: z.string(),
  noteTypeId: z.string(),
  language: z.string(),
  fields: z.array(z.string()),
  tags: z.array(z.string()),
  wordId: z.string().optional(),
  encounter: cardEncounterSchema.optional(),
  importedGenders: z.array(z.string()).optional(),
  mediaNamespace: z.string(),
  version: z.number().int().nonnegative(),
  created: z.number().finite(),
  updated: z.number().finite(),
  sourceId: z.string().optional(),
  source: z.record(z.string(), z.unknown()).optional(),
});
export const cardSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  templateOrdinal: z.number().int().nonnegative(),
  deckId: z.string().nullable(),
  language: z.string(),
  schedule: scheduleSchema.nullable(),
  suspended: z.boolean(),
  leech: z.boolean(),
  retentionOverride: z.number().min(0.7).max(0.99).nullable(),
  srsVersion: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  created: z.number().finite(),
  updated: z.number().finite(),
  sourceId: z.string().optional(),
  source: z.record(z.string(), z.unknown()).optional(),
});
export const cardAssetSchema = z.object({
  id: z.string(),
  namespace: z.string(),
  name: z.string(),
  mime: z.string(),
  blob: z.instanceof(Blob),
});
export const ankiReviewSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  sourceId: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});
export type NoteType = z.infer<typeof noteTypeSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Card = z.infer<typeof cardSchema>;
export type CardAsset = z.infer<typeof cardAssetSchema>;
export type FieldBindings = z.infer<typeof fieldBindingsSchema>;
export type AnkiReview = z.infer<typeof ankiReviewSchema>;
export type CardStudyDetails = {
  article?: string;
  grammar?: string[];
  partsOfSpeech: string[];
  forms: { label: string; value: string }[];
  ipa: string[];
};
export type CardDocument = {
  card: Card;
  note: Note;
  noteType: NoteType;
  study?: CardStudyDetails;
};

export const assetId = (namespace: string, name: string) =>
  JSON.stringify([namespace, name]);
