import type { Deck } from "@/srs/deck-model";
import { t } from "@/shared/i18n/i18n";

export const deckContains = (parent: string, name: string) =>
  parent === name || name.startsWith(`${parent}::`);

export type DeckNode = Deck & {
  label: string;
  parentId: string | null;
  depth: number;
};

// Anki paths can contain parents that have no saved cards or deck record.
export function deckTree(decks: Deck[]): DeckNode[] {
  const byPath = new Map(
    decks.map((deck) => [JSON.stringify([deck.language, deck.name]), deck]),
  );
  for (const deck of decks) {
    const parts = deck.name.split("::");
    for (let length = 1; length < parts.length; length++) {
      const name = parts.slice(0, length).join("::");
      const key = JSON.stringify([deck.language, name]);
      if (!byPath.has(key))
        byPath.set(key, {
          id: `folder:${key}`,
          name,
          language: deck.language,
          created: deck.created,
        });
    }
  }
  const nodes = [...byPath.values()].map((deck) => {
    const parts = deck.name.split("::");
    const parent = parts.slice(0, -1).join("::");
    return {
      ...deck,
      label: parts.at(-1)!,
      depth: parts.length - 1,
      parentId: byPath.get(JSON.stringify([deck.language, parent]))?.id ?? null,
    };
  });
  const result: DeckNode[] = [];
  function append(parentId: string | null) {
    for (const node of nodes
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => a.label.localeCompare(b.label))) {
      result.push(node);
      append(node.id);
    }
  }
  append(null);
  return result;
}

export function deckIdsInTree(decks: Deck[], id: string): string[] {
  const parent = deckTree(decks).find((deck) => deck.id === id);
  if (!parent) throw new Error(t("study_deck_not_found"));
  return decks
    .filter(
      (deck) =>
        deck.language === parent.language &&
        deckContains(parent.name, deck.name),
    )
    .map((deck) => deck.id);
}

export const deckPathLabel = (path: string) => path.replaceAll("::", " / ");
