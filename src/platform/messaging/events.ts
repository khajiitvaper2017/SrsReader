import type { ScanSpan } from "@/reader/scan";
import type { Occurrence } from "@/languages/analysis";
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
export type FrameMessage = { event: "closeLookup" };
export type ParsedOccurrenceMessage = {
  event: "parsedOccurrence";
  language: string;
  occurrence: Occurrence;
  candidates: ScanSpan["candidates"];
};
export type RuntimeEvent =
  ChangeMessage | ParsedMessage | ParsedOccurrenceMessage | FrameMessage;
