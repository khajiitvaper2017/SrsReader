import {
  fieldBindingsSchema,
  type FieldBindings,
  type CardDocument,
} from "@/cards/model";
import { z } from "zod";
import { languageSchema } from "@/languages/model";

export const importOptionsSchema = z.object({
  mode: z.enum(["preserve", "convert"]),
  language: languageSchema,
  deckIds: z.array(z.string()).default([]),
  duplicates: z.enum(["keep", "update"]).default("keep"),
  mergeNoteTypes: z.boolean().default(false),
  bindings: z.record(z.string(), fieldBindingsSchema).default({}),
  omitFields: z
    .record(z.string(), z.array(z.number().int().nonnegative()))
    .default({}),
});
export type AnkiImportOptions = z.infer<typeof importOptionsSchema>;
export type AnkiPreview = {
  noteTypes: {
    id: string;
    name: string;
    kind: "standard" | "cloze";
    fields: string[];
    templates: number;
    notes: number;
    cards: number;
    suggestedBindings: FieldBindings;
    samples: {
      cardId: string;
      deckId: string;
      deckName: string;
      ordinal: number;
      label: string;
    }[];
    sampleDocument: (cardId: string) => CardDocument;
    deckIds: string[];
  }[];
  decks: { id: string; name: string; cards: number }[];
  notes: number;
  cards: number;
  media: number;
  reviews: number;
  suspended: number;
  warnings: string[];
  incompatibleNoteTypes: string[];
  loadAssets: typeof import("@/cards/sandbox/assets").loadCardAssets;
  requestAsset: typeof import("@/cards/sandbox/assets").requestedCardAsset;
  close: () => Promise<unknown>;
};

export type RawObject = Record<string, unknown>;
export type AnkiModel = RawObject & {
  id: string;
  name: string;
  type: number;
  css: string;
  flds: (RawObject & { name: string; ord: number })[];
  tmpls: (RawObject & {
    name: string;
    ord: number;
    qfmt: string;
    afmt: string;
  })[];
};
export type AnkiNote = {
  id: string;
  guid: string;
  mid: string;
  mod: number;
  usn: number;
  tags: string;
  flds: string;
  sfld: string | number;
  csum: number;
  flags: number;
  data: string;
};
export type AnkiCard = {
  id: string;
  nid: string;
  did: string;
  ord: number;
  mod: number;
  usn: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  odue: number;
  odid: string;
  flags: number;
  data: string;
};
export type AnkiRevlog = {
  id: string;
  cid: string;
  usn: number;
  ease: number;
  ivl: number;
  lastIvl: number;
  factor: number;
  time: number;
  type: number;
};
export type AnkiCollection = {
  created: number;
  models: AnkiModel[];
  decks: (RawObject & { id: string; name: string })[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  reviews: AnkiRevlog[];
};
