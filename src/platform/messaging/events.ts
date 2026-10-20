import type { ScanSpan } from "@/reader/scan";
import type { WordState } from "@/vocabulary/state";

export type ChangeScope =
  "collection" | "vocabulary" | "settings" | "dictionaries" | "srs";
export type ChangeMessage = {
  event: "changed";
  scope: ChangeScope;
  word?: { id: string; state: WordState };
};
export type ParsedMessage = {
  event: "parsed";
  term: string;
  language: string;
  candidates: ScanSpan["candidates"];
};
export type FrameMessage =
  | { event: "closeLookup" }
  | { event: "resizeLookup"; session: string; height: number };
export type RuntimeEvent = ChangeMessage | ParsedMessage | FrameMessage;
