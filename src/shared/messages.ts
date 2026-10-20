import { audioInfoSchema, type AudioInfo } from "@/audio/model";
import type { ScanSpan } from "@/dictionaries/lookup";
import type { Dictionary, LookupResult } from "@/dictionaries/model";
import { settingsSchema, type Settings } from "@/settings/model";
import { translationSchema } from "@/translation/model";
import type { ExamplesResult } from "@/vocabulary/examples/query";
import {
  contextSchema,
  type ReadingContext,
  type Vocabulary,
} from "@/vocabulary/model";
import { z } from "zod";

const selection = {
  term: z.string().min(1).max(1000),
  context: contextSchema.optional(),
};

export const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings") }),
  z.object({ action: z.literal("setSettings"), value: settingsSchema }),
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
  z.object({ action: z.literal("invalidate") }),
  z.object({ action: z.literal("scan"), text: z.string().max(30000) }),
  z.object({ action: z.literal("detectLanguage"), text: z.string().max(6000) }),
  z.object({ action: z.literal("lookup"), term: selection.term }),
  z.object({
    action: z.literal("examples"),
    lemma: selection.term,
    surface: selection.term,
  }),
  z.object({ action: z.literal("exampleCorpus") }),
  z.object({ action: z.literal("createSession"), ...selection }),
  z.object({ action: z.literal("session"), id: z.string() }),
  z.object({ action: z.literal("closeLookup") }),
  z.object({
    action: z.literal("resizeLookup"),
    session: z.string(),
    height: z.number().int().min(1).max(460),
  }),
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
  }),
  z.object({ action: z.literal("deleteDefinition"), id: z.string() }),
  z.object({
    action: z.literal("grade"),
    ...selection,
    id: z.string(),
    rating: z.number().int().min(1).max(4),
    durationMs: z.number().finite().nonnegative().nullable().optional(),
    time: z.number().finite().optional(),
    source: z.enum(["reading", "review"]),
    version: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("known"),
    id: z.string(),
    term: selection.term,
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
    contexts: z.array(contextSchema),
  }),
  z.object({ action: z.literal("refreshWord"), id: z.string() }),
  z.object({ action: z.literal("undo"), id: z.string() }),
  z.object({ action: z.literal("words"), query: z.string().default("") }),
  z.object({ action: z.literal("queue") }),
  z.object({
    action: z.literal("preview"),
    id: z.string(),
    durationMs: z.number().finite().nonnegative().nullable().optional(),
  }),
  z.object({ action: z.literal("rwkvStatus") }),
  z.object({ action: z.literal("resetRwkv") }),
  z.object({ action: z.literal("prepareRwkv") }),
  z.object({
    action: z.literal("activateAlgorithm"),
    algorithm: z.enum(["fsrs", "rwkv"]),
  }),
  z.object({ action: z.literal("reschedule"), after: z.string().default("") }),
  z.object({
    action: z.literal("retentionOverride"),
    id: z.string(),
    value: z.number().min(0.7).max(0.99).nullable(),
  }),
  z.object({ action: z.literal("stats") }),
  z.object({ action: z.literal("audioSources"), id: z.string() }),
  z.object({
    action: z.literal("audio"),
    id: z.string(),
    download: z.boolean(),
    source: audioInfoSchema.optional(),
  }),
]);

export type Request = z.infer<typeof requestSchema>;

export type Responses = {
  settings: Settings;
  setSettings: Settings;
  dictionaries: Dictionary[];
  setDictionary: void;
  moveDictionary: void;
  deleteDictionary: void;
  invalidate: void;
  scan: ScanSpan[];
  detectLanguage: string | null;
  saveTranslation: void;
  lookup: LookupResult;
  examples: ExamplesResult;
  exampleCorpus: { count: number; installed: boolean };
  createSession: string;
  closeLookup: void;
  resizeLookup: void;
  session: { term: string; context?: ReadingContext };
  word: Vocabulary | undefined;
  mine: Vocabulary;
  defineWord: Vocabulary;
  deleteDefinition: void;
  grade: { word: Vocabulary; reviewId: string };
  known: Vocabulary;
  suspend: void;
  deleteWord: void;
  editWord: void;
  refreshWord: void;
  undo: void;
  words: Vocabulary[];
  queue: {
    words: Vocabulary[];
    due: number;
    fresh: number;
    waiting: number | null;
    wakeAt: number;
  };
  preview: number[];
  rwkvStatus: {
    downloaded: boolean;
    processed: number;
    total: number;
    ready: boolean;
  };
  prepareRwkv: Responses["rwkvStatus"];
  resetRwkv: void;
  activateAlgorithm: Settings;
  reschedule: { count: number; cursor: string | null };
  retentionOverride: void;
  stats: { total: number; known: number; due: number; today: number };
  audio: AudioInfo | null;
  audioSources: AudioInfo[];
};
