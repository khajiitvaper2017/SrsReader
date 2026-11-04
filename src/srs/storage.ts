import type { Card } from "@/cards/model";
import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { dayStart, studyDay } from "@/srs/study-day";
import type { candidates } from "@/srs/answers";
import type { SchedulingPreferences } from "@/srs/preferences";
import type { Schedule } from "@/srs/model";
import type { ReviewWord } from "@/vocabulary/model";
import type { Grade } from "ts-fsrs";
import { fsrsScheduler } from "@/srs/scheduler";

export type ReviewCommit = {
  word: ReviewWord;
  saved: Card;
  before: Card;
  expectedVersion: number;
  id: string;
  rating: Grade;
  source: "reading" | "review";
  durationMs: number | null;
  now: number;
  settings: SchedulingPreferences;
  result: Awaited<ReturnType<typeof candidates>>;
};
export async function commitReview({
  word,
  saved,
  before,
  expectedVersion,
  id,
  rating,
  source,
  durationMs,
  now,
  settings,
  result,
}: ReviewCommit) {
  await db.transaction(
    "rw",
    [
      db.cards,
      db.reviews,
      db.srsMeta,
      db.rwkvMeta,
      db.rwkvEntities,
      db.rwkvCards,
    ],
    async () => {
      const current = await db.cards.get(word.id);
      if (!current || current.srsVersion !== expectedVersion)
        throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
      const meta = await db.srsMeta.get("main");
      const sequence = (meta?.sequence ?? 0) + 1;
      await db.cards.put(saved);
      await db.reviews.put({
        id,
        cardId: word.id,
        wordId: word.wordId,
        language: word.language,
        time: now,
        rating,
        source,
        before: {
          id: before.id,
          language: before.language,
          version: before.version,
          srsVersion: before.srsVersion,
          schedule: before.schedule,
          suspended: before.suspended,
          leech: before.leech,
        },
        afterVersion: saved.version,
        afterSrsVersion: saved.srsVersion,
        after: saved.schedule,
        fsrsLog: result.revlogs[rating - 1] ?? null,
        log:
          settings.algorithm === "rwkv" ? { rwkvMode: settings.rwkvMode } : {},
        scheduler:
          settings.algorithm === "fsrs"
            ? fsrsScheduler(saved.schedule!.fsrs.version)
            : "rwkv-sm56-w8-s8",
        retention: result.retention,
        durationMs,
        sequence,
        active: true,
      });
      const neural = result.neural;
      if (neural) {
        const answer = neural.answers[rating - 1]!;
        await db.rwkvEntities.bulkPut(answer.entities);
        await db.rwkvCards.put(answer.card);
        await db.rwkvMeta.put({
          ...answer.meta,
          cursor: await db.reviews.count(),
        });
      }
      await db.srsMeta.put({
        ...meta,
        id: "main",
        sequence,
        undo: neural ? { reviewId: id, ...neural.before } : undefined,
      });
    },
  );
}
export const historyForDay = (language: string, start: number, now: number) =>
  db.reviews
    .where("time")
    .between(start, now, true, true)
    .filter((review) => review.active && review.language === language)
    .toArray();
export function rescheduleCard(id: string, card: Schedule | null) {
  return db.cards
    .where("id")
    .equals(id)
    .modify((current) => {
      current.schedule = card;
      current.version++;
      current.srsVersion++;
      current.updated = Date.now();
    });
}
export const clearUndo = () => db.srsMeta.update("main", { undo: undefined });

export async function statisticsHistory(now: number, rolloverHour: number) {
  const today = { answers: 0, durationMs: 0, timedAnswers: 0 };
  const activity = new Map<number, number>();
  const start = dayStart(studyDay(now, rolloverHour), rolloverHour);
  await db.reviews
    .where("time")
    .between(0, now, true, true)
    .filter((review) => review.active)
    .each((review) => {
      const day = studyDay(review.time, rolloverHour);
      activity.set(day, (activity.get(day) ?? 0) + 1);
      if (review.time >= start) {
        today.answers++;
        today.durationMs += review.durationMs ?? 0;
        if (review.durationMs !== null) today.timedAnswers++;
      }
    });
  return {
    today,
    activity: [...activity]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day - b.day),
  };
}
