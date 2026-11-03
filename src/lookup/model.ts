import type { ReadingContext } from "@/vocabulary/model";
import type { Occurrence } from "@/languages/analysis";

export type LookupPage = {
  term: string;
  context?: ReadingContext;
  occurrence?: Occurrence;
  refineContext?: boolean;
  selected?: string;
  scroll?: number;
  openDetails?: number[];
};
