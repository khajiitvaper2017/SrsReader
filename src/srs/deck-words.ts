import type { Deck } from "@/srs/deck-model";
import type { Vocabulary } from "@/vocabulary/model";
import { t } from "@/shared/i18n/i18n";

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

export function wordsInDeck(
  groups: ReturnType<typeof studyGroups>,
  deckId?: string,
) {
  if (deckId === "mined") return groups.mined;
  if (!deckId)
    return [...groups.mined, ...groups.decks.flatMap((deck) => deck.words)];
  const deck = groups.decks.find((deck) => deck.id === deckId);
  if (!deck) throw new Error(t("study_deck_not_found"));
  return deck.words;
}
