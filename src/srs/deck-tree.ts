import type { Deck } from "@/srs/deck-model";
import { t } from "@/shared/i18n/i18n";

export type DeckNode = Deck & {
  label: string;
  parentId: string | null;
  depth: number;
};

// Anki paths can contain parents that have no saved cards or deck record.
export function deckTree(decks: Deck[]): DeckNode[] {
  const pathKey = (language: string, path: string) =>
    JSON.stringify([language, path]);
  const byId = new Map(decks.map((deck) => [deck.id, deck]));
  const byPath = new Map(
    decks.flatMap((deck) => {
      const path =
        deck.legacyPath ??
        (deck.parentId === undefined ? deck.name : undefined);
      return path ? [[pathKey(deck.language, path), deck] as const] : [];
    }),
  );
  for (const deck of decks) {
    if (deck.parentId !== undefined) continue;
    const parts = deck.name.split("::");
    for (let length = 1; length < parts.length; length++) {
      const name = parts.slice(0, length).join("::");
      const key = pathKey(deck.language, name);
      if (!byPath.has(key)) {
        const folder = {
          id: `folder:${key}`,
          name,
          language: deck.language,
          created: deck.created,
        };
        byPath.set(key, folder);
        byId.set(folder.id, folder);
      }
    }
  }
  const children = new Map<string | null, Deck[]>();
  for (const deck of byId.values()) {
    const parts = deck.name.split("::");
    const parent =
      deck.parentId === undefined
        ? byPath.get(pathKey(deck.language, parts.slice(0, -1).join("::")))
        : deck.parentId && byId.get(deck.parentId);
    const parentId =
      parent && parent.language === deck.language ? parent.id : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(deck);
    children.set(parentId, siblings);
  }
  const labelOf = (deck: Deck) =>
    deck.parentId === undefined ? deck.name.split("::").at(-1)! : deck.name;
  const result: DeckNode[] = [];
  const visited = new Set<string>();
  function append(deck: Deck, parent?: DeckNode) {
    if (visited.has(deck.id)) return;
    visited.add(deck.id);
    const label = labelOf(deck);
    const node = {
      ...deck,
      legacyPath:
        deck.legacyPath ??
        (deck.parentId === undefined ? deck.name : undefined),
      name: parent ? `${parent.name}::${label}` : label,
      label,
      depth: parent ? parent.depth + 1 : 0,
      parentId: parent?.id ?? null,
    };
    result.push(node);
    for (const child of (children.get(deck.id) ?? []).sort(compare))
      append(child, node);
  }
  const compare = (a: Deck, b: Deck) =>
    labelOf(a).localeCompare(labelOf(b)) || a.id.localeCompare(b.id);
  for (const root of (children.get(null) ?? []).sort(compare)) append(root);
  // Concurrent moves can form a cycle. Show each affected deck once.
  for (const deck of [...byId.values()].sort(compare)) append(deck);
  return result;
}

export function deckIdsInTree(decks: Deck[], id: string): string[] {
  const nodes = deckTree(decks);
  const parent = nodes.find((deck) => deck.id === id);
  if (!parent) throw new Error(t("study_deck_not_found"));
  const saved = new Set(decks.map((deck) => deck.id));
  return deckBranch(nodes, nodes.indexOf(parent))
    .map((deck) => deck.id)
    .filter((id) => saved.has(id));
}

export function deckBranch<T extends { depth: number }>(
  nodes: T[],
  index: number,
) {
  const depth = nodes[index]!.depth;
  let end = index + 1;
  while (end < nodes.length && nodes[end]!.depth > depth) end++;
  return nodes.slice(index, end);
}

export const deckPathLabel = (path: string) => path.replaceAll("::", " / ");
