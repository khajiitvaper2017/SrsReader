import type { Deck } from "@/srs/deck-model";
import type { Vocabulary } from "@/vocabulary/model";

export function studyGroups(words: Vocabulary[], decks: Deck[]) {
  const mined = words.filter((word) => word.mined !== false);
  const assigned = new Set(mined.map((word) => word.id));
  return {
    mined,
    decks: [...decks]
      .sort((a, b) => a.created - b.created)
      .map((deck) => {
        const ids = new Set(deck.wordIds);
        const entries = words.filter(
          (word) => ids.has(word.id) && !assigned.has(word.id),
        );
        for (const word of entries) assigned.add(word.id);
        return { ...deck, words: entries };
      }),
  };
}
