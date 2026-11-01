import { orderNewWords } from "@/dictionaries/frequency";
import { getSettings } from "@/settings/store";
import { buildQueue } from "@/srs/queue-policy";
import { dailyCounts } from "@/srs/workload";
import { allReviewCards } from "@/vocabulary/storage";
import { db } from "@/platform/database/db";
import { studyGroups, wordsInDeck } from "@/srs/deck-words";
import { queueRandom } from "@/srs/queue-order";
import { studyDay } from "@/srs/study-day";
import type { ReviewWord } from "@/vocabulary/model";
import type { SchedulingPreferences } from "@/srs/preferences";

export async function reviewQueue(
  language: string,
  deckId?: string,
  limits?: Pick<SchedulingPreferences, "newLimit" | "reviewLimit">,
) {
  const settings = {
    ...(await getSettings()),
    ...limits,
    studyLanguage: language,
  };
  const now = Date.now();
  const [saved, decks] = await Promise.all([
    allReviewCards(settings.studyLanguage),
    db.decks.where("language").equals(settings.studyLanguage).toArray(),
  ]);
  const groups = studyGroups(saved, decks);
  const included = wordsInDeck(groups, deckId);
  const words = included.filter(
    (word) => word.card && !word.known && !word.suspended,
  );
  const counts = await dailyCounts(settings, now);
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
  const byCreated = (a: ReviewWord, b: ReviewWord) =>
    a.created - b.created || a.id.localeCompare(b.id);
  const byRandom = (a: ReviewWord, b: ReviewWord) =>
    queueRandom(a.id, day) - queueRandom(b.id, day) || byCreated(a, b);
  const byDeck = (a: ReviewWord, b: ReviewWord) =>
    deckOrder.get(a.id)! - deckOrder.get(b.id)!;
  const newWords = words.filter((word) => word.card!.state === 0);
  const gatherOrder = {
    deck: (a: ReviewWord, b: ReviewWord) => byDeck(a, b) || byCreated(a, b),
    deck_random: (a: ReviewWord, b: ReviewWord) =>
      byDeck(a, b) || byRandom(a, b),
    oldest: byCreated,
    newest: (a: ReviewWord, b: ReviewWord) => byCreated(b, a),
    random: byRandom,
  };
  const orderedNew =
    (settings.reviewLimit ?? Infinity) > counts.reviews
      ? settings.newGatherOrder === "frequency"
        ? await orderNewWords(newWords, settings)
        : newWords.sort(gatherOrder[settings.newGatherOrder])
      : [];
  const queue = buildQueue(words, counts, settings, now, orderedNew, deckOrder);
  return {
    ...queue,
    words: queue.words.map(({ document: _document, ...word }) => word),
    document: queue.words[0]?.document,
    today: counts.today,
    total: saved.length,
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
          word.card!.due <= now,
      ),
    forecast: [1, 2, 3].map((days) => ({
      days,
      count: words.filter(
        (word) =>
          word.card!.state !== 0 &&
          studyDay(word.card!.due, settings.rolloverHour) === day + days,
      ).length,
    })),
  };
}
