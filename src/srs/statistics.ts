import type { Settings } from "@/settings/model";
import { statisticsHistory } from "@/srs/storage";
import { dayStart, studyDay } from "@/srs/study-day";
import { calendarStatistics } from "@/srs/statistics-calendar";
import { deckIdsInTree } from "@/srs/deck-tree";
import { queueEntries, type QueueEntry } from "@/srs/queue-entries";
import { db } from "@/platform/database/db";
import { createScheduler } from "@/srs/scheduler";

export type StatisticsScope = { language: string; deckId?: string };
export type StatisticsRange = 30 | 90 | 365;
export type ReviewStatistics = Awaited<ReturnType<typeof reviewStatistics>>;

export async function reviewStatistics(
  settings: Settings,
  {
    year,
    scope,
    range,
  }: { year?: number; scope?: StatisticsScope; range?: StatisticsRange },
) {
  const now = Date.now();
  const today = studyDay(now, settings.rolloverHour);
  const currentYear = new Date(
    dayStart(today, settings.rolloverHour),
  ).getFullYear();
  const deckId = scope?.deckId;
  const deckIds =
    scope && deckId && deckId !== "mined"
      ? deckIdsInTree(
          await db.decks.where("language").equals(scope.language).toArray(),
          deckId,
        )
      : undefined;
  const languages = scope
    ? [scope.language]
    : (await db.cards.orderBy("language").uniqueKeys()).map(String);
  const entries = (
    await Promise.all(
      languages.map((language) => queueEntries(language, deckIds)),
    )
  ).flat();
  const words =
    deckId === "mined"
      ? entries.filter((card) => card.deckId === null)
      : entries;
  const history = await statisticsHistory(
    now,
    settings.rolloverHour,
    scope && {
      language: scope.language,
      cardIds: deckId ? words.map((word) => word.id) : undefined,
    },
    range && { range, matureIntervalDays: settings.matureIntervalDays },
  );
  return {
    today: history.today,
    calendar: calendarStatistics(
      words,
      history.activity,
      year ?? currentYear,
      settings,
      now,
    ),
    details: range
      ? {
          ...cardStatistics(
            words,
            settings,
            now,
            today,
            range,
            history.activity,
          ),
          retention: history.retention,
          hourly: history.hourly,
          grades: history.grades,
        }
      : undefined,
  };
}

function period(start: number, range: number, interval: number) {
  return Array.from({ length: Math.ceil(range / interval) }, (_, index) => ({
    start: start + index * interval,
    end: start + Math.min(range, (index + 1) * interval) - 1,
    count: 0,
  }));
}

function cardStatistics(
  cards: QueueEntry[],
  settings: Settings,
  now: number,
  today: number,
  range: StatisticsRange,
  activity: { day: number; count: number }[],
) {
  const interval = range === 30 ? 1 : range === 90 ? 3 : 14;
  const start = today - range + 1;
  const reviews = period(start, range, interval);
  const added = period(start, range, interval);
  const upcoming = period(today + 1, range, interval);
  const counts = {
    new: 0,
    learning: 0,
    relearning: 0,
    young: 0,
    mature: 0,
    suspended: 0,
    mastered: 0,
    unscheduled: 0,
  };
  const dayLimits = [1, 3, 7, 14, 30, 60, 90, 180, 365];
  const durations = {
    interval: Array<number>(dayLimits.length + 1).fill(0),
    stability: Array<number>(dayLimits.length + 1).fill(0),
  };
  const difficulty = Array<number>(10).fill(0);
  const recall = Array<number>(10).fill(0);
  const schedulers = new Map<string, ReturnType<typeof createScheduler>>();
  let due = 0;
  let tomorrow = 0;
  for (const { day, count } of activity)
    if (day >= start)
      reviews[Math.floor((day - start) / interval)]!.count += count;
  for (const entry of cards) {
    const created = studyDay(entry.created, settings.rolloverHour);
    if (created >= start && created <= today)
      added[Math.floor((created - start) / interval)]!.count++;
    const schedule = entry.card;
    if (entry.suspended) counts.suspended++;
    else if (entry.known) counts.mastered++;
    else if (!schedule) counts.unscheduled++;
    else if (schedule.state === 0) counts.new++;
    else {
      if (schedule.state === 1) counts.learning++;
      else if (schedule.state === 3) counts.relearning++;
      else if (schedule.scheduledDays >= settings.matureIntervalDays)
        counts.mature++;
      else counts.young++;
      const ahead = studyDay(schedule.dueAt, settings.rolloverHour) - today;
      if (schedule.dueAt <= now) due++;
      if (ahead === 1) tomorrow++;
      if (ahead > 0 && ahead <= range)
        upcoming[Math.floor((ahead - 1) / interval)]!.count++;
      if (schedule.state === 2) {
        const intervalBin = dayLimits.findIndex(
          (limit) => schedule.scheduledDays <= limit,
        );
        durations.interval[intervalBin < 0 ? dayLimits.length : intervalBin]!++;
      }
      if (schedule.stability <= 0 || schedule.lastReviewAt === null) continue;
      const stabilityBin = dayLimits.findIndex(
        (limit) => schedule.stability <= limit,
      );
      durations.stability[
        stabilityBin < 0 ? dayLimits.length : stabilityBin
      ]!++;
      difficulty[
        Math.min(9, Math.max(0, Math.floor(schedule.difficulty) - 1))
      ]!++;
      const key = JSON.stringify(schedule.fsrs);
      let scheduler = schedulers.get(key);
      if (!scheduler) {
        scheduler = createScheduler(
          settings,
          settings.retention,
          schedule.fsrs,
        );
        schedulers.set(key, scheduler);
      }
      const probability = scheduler.model.forgettingCurve(
        schedule,
        scheduler.chrono.difference(
          new Date(schedule.lastReviewAt),
          new Date(now),
        ),
      );
      if (Number.isFinite(probability))
        recall[Math.min(9, Math.max(0, Math.floor(probability * 10)))]!++;
    }
  }
  return {
    counts,
    reviews,
    added,
    upcoming,
    due,
    tomorrow,
    dayLimits,
    durations,
    difficulty,
    recall,
  };
}
