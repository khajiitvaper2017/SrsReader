import type { Deck } from "@/srs/deck-model";
import type { ReviewWord, WordWithCards } from "@/vocabulary/model";
import { t } from "@/shared/i18n/i18n";
import { deckBranch, deckTree } from "@/srs/deck-tree";

export const isFrequencyWord = (term: string) => /\p{L}/u.test(term);

type GroupWord = WordWithCards | ReviewWord;
export function studyGroups<T extends GroupWord>(words: T[], decks: Deck[]) {
  const belongs = (word: T, id: string | null) =>
    "document" in word
      ? word.document.card.deckId === id
      : word.linkedCards.some((card) => card.deckId === id) ||
        (id === null && !word.linkedCards.length && word.mined !== false);
  const direct = new Map(
    decks.map((deck) => [
      deck.id,
      words.filter(
        (word) =>
          belongs(word, deck.id) &&
          (!deck.dictionaryId || isFrequencyWord(word.lemma)),
      ),
    ]),
  );
  const nodes = deckTree(decks);
  return {
    mined: words.filter((word) => belongs(word, null)),
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
