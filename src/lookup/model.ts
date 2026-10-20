import type { ReadingContext } from "@/vocabulary/model";
export type LookupPage = {
  term: string;
  context?: ReadingContext;
  selected?: string;
  scroll?: number;
  openDetails?: number[];
};
