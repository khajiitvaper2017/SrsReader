import type { ScanSpan } from "@/reader/scan";
import type { Occurrence } from "@/languages/analysis";
import type { WordState } from "@/vocabulary/state";
import type { ScanResult } from "@/reader/contracts";

export type ChangeScope =
  | "frequency"
  | "collection"
  | "vocabulary"
  | "settings"
  | "dictionaries"
  | "dictionaryVisibility"
  | "srs";
export type ChangeMessage = {
  event: "changed";
  scope: ChangeScope;
  word?: {
    id: string;
    state: WordState;
    hiddenDictionaries?: string[];
    expandedDictionaries?: string[];
  };
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
export type ScanWarning = (
  message: string,
  details: Record<string, unknown>,
) => void;

export const logScanWarning: ScanWarning = (message, details) =>
  console.warn(`[SrsReader] ${message}`, details);

export type RuntimeEvent =
  | ChangeMessage
  | ParsedMessage
  | ParsedOccurrenceMessage
  | FrameMessage
  | { event: "scanWarning"; message: string; details: Record<string, unknown> }
  | { event: "scanResult"; session: string; text: string; result: ScanResult };
