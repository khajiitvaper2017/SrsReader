import type { ScanSpan } from "@/reader/scan";
import type { LanguagesPreferences } from "@/languages/preferences";
import type { ReaderPreferences } from "@/reader/preferences";
import type { LookupPage } from "@/lookup/model";
import type { PageScope } from "@/reader/input-prevention";

export type Part = { node: Text; start: number; end: number };
export type Block = {
  language: string;
  text: string;
  parts: Part[];
  spans: (ScanSpan & { range: Range })[];
  ranges: Range[];
  generation: number;
};
export type ReaderOptions = {
  scope?: PageScope;
  language?: string;
  settings?: import("@/settings/model").Settings;
  root?: HTMLElement;
  onLookup?: (page: LookupPage) => void;
  source?: { url: string; title: string };
};
export type Pointer = {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
};

export type ReaderConfiguration = ReaderPreferences &
  LanguagesPreferences & { setupComplete: boolean };
