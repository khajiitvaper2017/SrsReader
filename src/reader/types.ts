import type { ScanSpan } from "@/dictionaries/lookup";
import type { ReadingContext } from "@/vocabulary/model";
export type Part = { node: Text; start: number; end: number };
export type Block = {
  text: string;
  parts: Part[];
  spans: (ScanSpan & { range: Range })[];
  ranges: Range[];
  generation: number;
};
export type ReaderOptions = {
  root?: HTMLElement;
  onLookup?: (term: string, context: ReadingContext) => void;
  source?: { url: string; title: string };
};
export type Pointer = {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
};
