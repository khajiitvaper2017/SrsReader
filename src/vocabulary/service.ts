import type { LookupWord } from "@/dictionaries/model";
import type { Vocabulary } from "@/vocabulary/model";

export function freshWord(word: LookupWord): Vocabulary {
  return {
    ...word,
    meanings: structuredClone(word.meanings),
    mined: true,
    known: false,
    version: 0,
    created: Date.now(),
    updated: Date.now(),
  };
}
