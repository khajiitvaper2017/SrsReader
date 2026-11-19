import { orderNewWords } from "@/dictionaries/frequency";
import { getSettings } from "@/settings/store";
import { buildQueue } from "@/srs/queue-policy";
import { dailyCounts } from "@/srs/workload";
import { reviewCards } from "@/vocabulary/storage";
import { db } from "@/platform/database/db";
import { studyGroups, wordsInDeck } from "@/srs/deck-words";
import { deckIdsInTree } from "@/srs/deck-tree";
import { queueRandom } from "@/srs/queue-order";
import { studyDay } from "@/srs/study-day";
import { queueEntries, type QueueEntry } from "@/srs/queue-entries";
import type { SchedulingPreferences } from "@/srs/preferences";
import { prepareStudyDocument } from "@/cards/study";

export async function reviewQueue(
  language: string,
  deckId?: string,
  limits?: Pick<SchedulingPreferences, "newLimit" | "reviewLimit">,
  currentCardId?: string,
) {
  const settings = {
    ...(await getSettings()),
    ...limits,
    studyLanguage: language,
  };
  const now = Date.now();
  const decks = await db.decks.where("language").equals(language).toArray();
  const selectedDecks =
    deckId && deckId !== "mined" ? deckIdsInTree(decks, deckId) : undefined;
  const saved = await queueEntries(language, selectedDecks);
  const groups = studyGroups(saved, decks);
  const included = wordsInDeck(groups, deckId);
  const counts = await dailyCounts(settings, now);
  const words = included.filter(
    (word) =>
      word.card &&
      !word.known &&
      !word.suspended &&
      (word.buriedUntil ?? 0) <= now &&
      !counts.buried.has(word.id),
  );
  const deckOrder = new Map(
    [
      groups.mined,
      ...[...groups.decks]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((deck) => deck.words),
    ].flatMap((entries, index) =>
      entries.map((word) => [word.id, index] as const),
    ),
  );
  const day = studyDay(now, settings.rolloverHour);
  const byCreated = (a: QueueEntry, b: QueueEntry) =>
    a.created - b.created || a.id.localeCompare(b.id);
  const byRandom = (a: QueueEntry, b: QueueEntry) =>
    queueRandom(a.id, day) - queueRandom(b.id, day) || byCreated(a, b);
  const byDeck = (a: QueueEntry, b: QueueEntry) =>
    deckOrder.get(a.id)! - deckOrder.get(b.id)!;
  const newWords = words.filter((word) => word.card!.state === 0);
  const gatherOrder = {
    deck: (a: QueueEntry, b: QueueEntry) => byDeck(a, b) || byCreated(a, b),
    deck_random: (a: QueueEntry, b: QueueEntry) =>
      byDeck(a, b) || byRandom(a, b),
    oldest: byCreated,
    newest: (a: QueueEntry, b: QueueEntry) => byCreated(b, a),
    random: byRandom,
  };
  const orderedNew =
    (settings.reviewLimit ?? Infinity) > counts.reviews
      ? settings.newGatherOrder === "frequency"
        ? await orderNewWords(newWords, settings)
        : newWords.sort(gatherOrder[settings.newGatherOrder])
      : [];
  const queue = buildQueue(words, counts, settings, now, orderedNew, deckOrder);
  const current =
    currentCardId && queue.words.find((word) => word.id === currentCardId);
  const upcoming = current
    ? [current, ...queue.words.filter((word) => word !== current).slice(0, 2)]
    : queue.words.slice(0, 3);
  const details = await reviewCards(
    (await db.cards.bulkGet(upcoming.map((word) => word.id))).filter(
      (card) => !!card,
    ),
  );
  return {
    ...queue,
    remaining: queue.words.length,
    words: details.map(({ document: _document, ...word }) => word),
    document: details[0]
      ? await prepareStudyDocument(details[0].document, details[0])
      : undefined,
    today: counts.today,
    total: selectedDecks
      ? await db.cards.where("language").equals(language).count()
      : saved.length,
    limits: {
      newLimit: Math.max(settings.newLimit, counts.introduced),
      reviewLimit:
        settings.reviewLimit === null
          ? null
          : Math.max(settings.reviewLimit, counts.reviews),
    },
    canStudyMore:
      newWords.length > 0 ||
      words.some(
        (word) =>
          (word.card!.state === 2 || word.card!.interday) &&
          word.card!.dueAt <= now,
      ),
    forecast: [1, 2, 3].map((days) => ({
      days,
      count: words.filter(
        (word) =>
          word.card!.state !== 0 &&
          studyDay(word.card!.dueAt, settings.rolloverHour) === day + days,
      ).length,
    })),
  };
}
