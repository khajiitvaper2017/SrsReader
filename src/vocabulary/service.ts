import type { LookupWord } from "@/dictionaries/model";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";

export function freshWord(word: LookupWord): Vocabulary {
  return {
    ...word,
    meanings: structuredClone(word.meanings),
    contexts: [],
    known: false,
    suspended: false,
    card: null,
    srsVersion: 0,
    leech: false,
    retentionOverride: null,
    version: 0,
    created: Date.now(),
    updated: Date.now(),
  };
}

export function addContext(word: Vocabulary, context?: ReadingContext) {
  if (!context) return;
  const existing = word.contexts.find(
    (c) => c.sentence === context.sentence && c.start === context.start,
  );
  if (!existing) word.contexts.push(context);
  else if (context.translation && !existing.translation)
    existing.translation = context.translation;
}
