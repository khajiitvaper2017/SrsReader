import type { Settings } from "@/settings/model";
import { deckBranch } from "@/srs/deck-tree";
import { wordsInDeck, type studyGroups } from "@/srs/deck-words";
import { deckPreferences, type SchedulingPreferences } from "@/srs/preferences";
import type { QueueEntry } from "@/srs/queue-entries";
import type { dailyCounts } from "@/srs/workload";
import { minedCardDeferredUntil } from "@/srs/study-day";

type Counts = Awaited<ReturnType<typeof dailyCounts>>;
type Budget = { fresh: number; reviews: number };

export function deckQueueScope(
  defaults: Settings,
  groups: ReturnType<typeof studyGroups<QueueEntry>>,
  daily: Counts,
  now: number,
  deckId?: string,
  limits?: Pick<SchedulingPreferences, "newLimit" | "reviewLimit">,
) {
  const index = groups.decks.findIndex((deck) => deck.id === deckId);
  const minedSettings = defaults.minedReviewSettings[defaults.studyLanguage];
  const overrides =
    deckId === "mined" ? minedSettings : groups.decks[index]?.reviewSettings;
  const settings = { ...deckPreferences(defaults, overrides), ...limits };
  const entries = wordsInDeck(groups, deckId);
  const active = entries.filter(
    (word) =>
      word.card &&
      !word.known &&
      !word.suspended &&
      (word.buriedUntil ?? 0) <= now &&
      !daily.buried.has(word.id),
  );
  const words = active.filter(
    (word) =>
      word.card!.reps || !minedCardDeferredUntil(word.minedAt, settings, now),
  );
  function tally(cards: QueueEntry[]) {
    const result = { introduced: 0, reviews: 0 };
    for (const card of cards) {
      const counts = daily.byCard.get(card.id);
      result.introduced += counts?.introduced ?? 0;
      result.reviews += counts?.reviews ?? 0;
    }
    return result;
  }
  const counts = {
    today: daily.today,
    introduced: daily.introduced,
    reviews: daily.reviews,
  };
  if (
    overrides?.newLimit !== undefined ||
    overrides?.reviewLimit !== undefined
  ) {
    const used = tally(entries);
    if (overrides.newLimit !== undefined) counts.introduced = used.introduced;
    if (overrides.reviewLimit !== undefined) counts.reviews = used.reviews;
  }
  const children =
    index >= 0
      ? deckBranch(groups.decks, index).slice(1)
      : deckId
        ? []
        : [
            ...groups.decks,
            { words: groups.mined, reviewSettings: minedSettings },
          ];
  const budgets = new Map<string, Budget[]>();
  for (const deck of children) {
    const options = deck.reviewSettings;
    if (options?.newLimit === undefined && options?.reviewLimit == null)
      continue;
    const used = tally(deck.words);
    const reviews = Math.max(
      0,
      (options?.reviewLimit ?? Infinity) - used.reviews,
    );
    const budget = {
      fresh:
        reviews > 0
          ? Math.max(0, (options?.newLimit ?? Infinity) - used.introduced)
          : 0,
      reviews,
    };
    for (const word of deck.words) {
      const existing = budgets.get(word.id) ?? [];
      existing.push(budget);
      budgets.set(word.id, existing);
    }
  }
  function withinDeckLimit(id: string, kind: keyof Budget, consume: boolean) {
    const caps = budgets.get(id);
    if (!caps) return true;
    if (caps.some((cap) => cap[kind] <= 0)) return false;
    if (consume) for (const cap of caps) cap[kind]--;
    return true;
  }
  return {
    settings,
    entries,
    words,
    counts,
    withinDeckLimit,
    deferredMined: active.length - words.length,
  };
}
