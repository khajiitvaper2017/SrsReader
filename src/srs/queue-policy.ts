import type { SchedulingPreferences } from "@/srs/preferences";
import { dayStart, studyDay } from "@/srs/study-day";
import type { Vocabulary } from "@/vocabulary/model";

export function buildQueue(
  words: Vocabulary[],
  counts: { today: number; introduced: number; reviews: number },
  settings: SchedulingPreferences,
  now: number,
  orderedNew: Vocabulary[],
) {
  const available = Math.max(
    0,
    (settings.reviewLimit ?? Infinity) - counts.reviews,
  );
  const byDue = (a: Vocabulary, b: Vocabulary) =>
    a.card!.due - b.card!.due || a.id.localeCompare(b.id);
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
    .sort(byDue);
  const reviews = words
    .filter((word) => word.card!.state === 2 && word.card!.due <= now)
    .sort(byDue);
  const due = [...learning, ...[...interday, ...reviews].slice(0, available)];
  const fresh =
    available > 0
      ? orderedNew.slice(0, Math.max(0, settings.newLimit - counts.introduced))
      : [];
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
  const queued = [...due, ...fresh, ...ahead];
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
