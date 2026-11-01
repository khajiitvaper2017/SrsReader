import type { SchedulingPreferences } from "@/srs/preferences";
import { dayStart, studyDay } from "@/srs/study-day";
import type { ReviewWord } from "@/vocabulary/model";
import { mergeQueues, queueRandom } from "@/srs/queue-order";

export function buildQueue(
  words: ReviewWord[],
  counts: { today: number; introduced: number; reviews: number },
  settings: SchedulingPreferences,
  now: number,
  orderedNew: ReviewWord[],
  deckOrder: ReadonlyMap<string, number> = new Map(),
) {
  const available = Math.max(
    0,
    (settings.reviewLimit ?? Infinity) - counts.reviews,
  );
  const byDue = (a: ReviewWord, b: ReviewWord) =>
    a.card!.due - b.card!.due || a.id.localeCompare(b.id);
  const day = studyDay(now, settings.rolloverHour);
  const byRandom = (a: ReviewWord, b: ReviewWord) =>
    queueRandom(a.id, day) - queueRandom(b.id, day) || a.id.localeCompare(b.id);
  const byDeck = (a: ReviewWord, b: ReviewWord) =>
    (deckOrder.get(a.id) ?? 0) - (deckOrder.get(b.id) ?? 0);
  const byDueDay = (a: ReviewWord, b: ReviewWord) =>
    studyDay(a.card!.due, settings.rolloverHour) -
    studyDay(b.card!.due, settings.rolloverHour);
  const reviewOrder = {
    due: byDue,
    due_random: (a: ReviewWord, b: ReviewWord) =>
      byDueDay(a, b) || byRandom(a, b),
    due_deck: (a: ReviewWord, b: ReviewWord) =>
      byDueDay(a, b) || byDeck(a, b) || byDue(a, b),
    deck_due: (a: ReviewWord, b: ReviewWord) => byDeck(a, b) || byDue(a, b),
    interval_asc: (a: ReviewWord, b: ReviewWord) =>
      a.card!.scheduled_days - b.card!.scheduled_days || byDue(a, b),
    interval_desc: (a: ReviewWord, b: ReviewWord) =>
      b.card!.scheduled_days - a.card!.scheduled_days || byDue(a, b),
    random: byRandom,
  };
  const learning = words
    .filter(
      (word) =>
        (word.card!.state === 1 || word.card!.state === 3) &&
        !word.card!.interday &&
        word.card!.due <= now,
    )
    .sort(byDue);
  const interday = words
    .filter((word) => word.card!.interday && word.card!.due <= now)
    .sort(byDue)
    .slice(0, available);
  const reviews = words
    .filter((word) => word.card!.state === 2 && word.card!.due <= now)
    .sort(reviewOrder[settings.reviewSortOrder])
    .slice(0, Math.max(0, available - interday.length));
  const scheduled = mergeQueues(
    interday,
    reviews,
    settings.interdayReviewOrder,
    day,
  );
  const due = [...learning, ...scheduled];
  const fresh =
    available > 0
      ? orderedNew.slice(0, Math.max(0, settings.newLimit - counts.introduced))
      : [];
  if (settings.newSortOrder === "random")
    fresh.sort(
      (a, b) =>
        queueRandom(a.id, day + 1) - queueRandom(b.id, day + 1) ||
        a.id.localeCompare(b.id),
    );
  const future = words
    .filter(
      (word) =>
        (word.card!.state === 1 || word.card!.state === 3) &&
        !word.card!.interday &&
        word.card!.due > now,
    )
    .sort(byDue);
  const ahead =
    due.length || fresh.length
      ? []
      : future.filter(
          (word) => word.card!.due <= now + settings.learnAheadMinutes * 60000,
        );
  const rollover = dayStart(
    studyDay(now, settings.rolloverHour) + 1,
    settings.rolloverHour,
  );
  const waiting = Math.min(
    rollover,
    ...future.map((word) =>
      Math.max(now + 500, word.card!.due - settings.learnAheadMinutes * 60000),
    ),
  );
  const queued = [
    ...learning,
    ...mergeQueues(fresh, scheduled, settings.newReviewOrder, day + 1),
    ...ahead,
  ];
  return {
    words: queued,
    learning: queued.filter((word) => word.card!.state === 1).length,
    relearning: queued.filter((word) => word.card!.state === 3).length,
    reviews: queued.filter((word) => word.card!.state === 2).length,
    ahead: ahead.length,
    due: due.length,
    fresh: fresh.length,
    waiting: future.length ? waiting : null,
    wakeAt: waiting,
  };
}
