import { browser } from "wxt/browser";
import { z } from "zod";
import {
  contextSchema,
  settingsSchema,
  type AudioInfo,
  type Dictionary,
  type LookupResult,
  type ReadingContext,
  type Settings,
  type Vocabulary,
} from "./model";
import type { ScanSpan } from "./lookup";

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
    enabled: z.boolean().optional(),
    order: z.number().int().optional(),
  }),
  z.object({ action: z.literal("deleteDictionary"), id: z.string() }),
  z.object({ action: z.literal("invalidate") }),
  z.object({ action: z.literal("scan"), text: z.string().max(30000) }),
  z.object({ action: z.literal("lookup"), term: selection.term }),
  z.object({ action: z.literal("createSession"), ...selection }),
  z.object({ action: z.literal("session"), id: z.string() }),
  z.object({ action: z.literal("closeLookup") }),
  z.object({
    action: z.literal("resizeLookup"),
    session: z.string(),
    height: z.number().int().min(1).max(460),
  }),
  z.object({ action: z.literal("word"), id: z.string() }),
  z.object({ action: z.literal("mine"), ...selection, id: z.string() }),
  z.object({
    action: z.literal("grade"),
    ...selection,
    id: z.string(),
    rating: z.number().int().min(1).max(4),
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
  z.object({ action: z.literal("preview"), id: z.string() }),
  z.object({ action: z.literal("stats") }),
  z.object({
    action: z.literal("audio"),
    id: z.string(),
    download: z.boolean(),
  }),
]);
export type Request = z.infer<typeof requestSchema>;
type Responses = {
  settings: Settings;
  setSettings: Settings;
  dictionaries: Dictionary[];
  setDictionary: void;
  deleteDictionary: void;
  invalidate: void;
  scan: ScanSpan[];
  lookup: LookupResult;
  createSession: string;
  closeLookup: void;
  resizeLookup: void;
  session: { term: string; context?: ReadingContext };
  word: Vocabulary | undefined;
  mine: Vocabulary;
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
  };
  preview: number[];
  stats: { total: number; known: number; due: number; today: number };
  audio: AudioInfo | null;
};
export async function rpc<R extends Request>(
  request: R,
): Promise<Responses[R["action"]]> {
  const response = await browser.runtime.sendMessage(request);
  if (!response || response.error)
    throw new Error(
      response?.error || "The extension could not respond. Reload this page.",
    );
  return response.value;
}
export async function changed() {
  await browser.runtime.sendMessage({ action: "invalidate" });
}
