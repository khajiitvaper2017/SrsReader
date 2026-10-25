import type { ReadingContext } from "@/vocabulary/model";
import type { OccurrenceGrammar } from "@/languages/analysis";

export type SentenceExample = ReadingContext & { grammar?: OccurrenceGrammar };

export type Corpus = {
  sentences: [number, string, string][];
  index: Record<string, number[]>;
};

export type Example = { id: number; author: string; context: ReadingContext };
export type ExamplesResult = { installed: boolean; examples: Example[] };
