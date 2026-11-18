import type { Deck } from "@/srs/deck-model";
import type { WordWithCards } from "@/vocabulary/model";
import { t } from "@/shared/i18n/i18n";
import { deckBranch, deckTree } from "@/srs/deck-tree";

export const isFrequencyWord = (term: string) => /\p{L}/u.test(term);

import type { QueueEntry } from "@/srs/queue-entries";
type GroupWord = WordWithCards | QueueEntry;
export function studyGroups<T extends GroupWord>(words: T[], decks: Deck[]) {
  const direct = new Map<string | null, T[]>();
  const frequencyDecks = new Set(
    decks.filter((deck) => deck.dictionaryId).map((deck) => deck.id),
  );
  for (const word of words) {
    const ids =
      "deckId" in word
        ? new Set([word.deckId])
        : new Set(word.linkedCards.map((card) => card.deckId));
    if (!ids.size && "mined" in word && word.mined !== false) ids.add(null);
    for (const id of ids) {
      if (id && frequencyDecks.has(id) && !isFrequencyWord(word.lemma))
        continue;
      const entries = direct.get(id) ?? [];
      entries.push(word);
      direct.set(id, entries);
    }
  }
  const nodes = deckTree(decks);
  return {
    mined: direct.get(null) ?? [],
    decks: nodes.map((deck, index) => ({
      ...deck,
      words: deckBranch(nodes, index).flatMap(
        (child) => direct.get(child.id) ?? [],
      ),
    })),
  };
}
export function wordsInDeck<T extends GroupWord>(
  groups: ReturnType<typeof studyGroups<T>>,
  deckId?: string,
) {
  const words =
    deckId === "mined"
      ? groups.mined
      : !deckId
        ? [...groups.mined, ...groups.decks.flatMap((deck) => deck.words)]
        : groups.decks.find((deck) => deck.id === deckId)?.words;
  if (!words) throw new Error(t("study_deck_not_found"));
  return [...new Map(words.map((word) => [word.id, word])).values()];
}
