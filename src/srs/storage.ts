import type { LookupWord } from "@/dictionaries/model";
import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { dayStart, studyDay } from "@/srs/study-day";
import type { ReviewSummary } from "@/srs/history";
import type { candidates } from "@/srs/answers";
import type { SchedulingPreferences } from "@/srs/preferences";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import type { Grade } from "ts-fsrs";

export type ReviewCommit = {
  word: LookupWord;
  saved: Vocabulary;
  before: Vocabulary | undefined;
  expectedVersion: number;
  id: string;
  rating: Grade;
  source: "reading" | "review";
  context?: ReadingContext;
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
      db.vocabulary,
      db.reviews,
      db.srsMeta,
      db.rwkvMeta,
      db.rwkvEntities,
      db.rwkvCards,
    ],
    async () => {
      const current = await db.vocabulary.get(word.id);
      if ((current?.srsVersion ?? 0) !== expectedVersion)
        throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
      // Metadata writes can finish while the model calculates an answer.
      if (current) {
        saved.meanings = current.meanings;
        saved.definitionOverrides = current.definitionOverrides;
        saved.hiddenDictionaries = current.hiddenDictionaries;
        saved.expandedDictionaries = current.expandedDictionaries;
        saved.mined = current.mined !== false || saved.mined;
        saved.version = current.version + 1;
      }
      const meta = await db.srsMeta.get("main");
      const sequence = (meta?.sequence ?? 0) + 1;
      await db.vocabulary.put(saved);
      await db.reviews.put({
        id,
        wordId: word.id,
        time: now,
        rating,
        source,
        before: before ?? null,
        afterVersion: saved.version,
        afterSrsVersion: saved.srsVersion,
        after: saved.card,
        log:
          settings.algorithm === "rwkv" ? { rwkvMode: settings.rwkvMode } : {},
        scheduler:
          settings.algorithm === "fsrs"
            ? "ts-fsrs@5.4.2/FSRS-6"
            : "rwkv-sm55-w8-s8",
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
        await db.rwkvMeta.put({ ...answer.meta, cursor: sequence });
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
    .filter(
      (review) => review.active && JSON.parse(review.wordId)[0] === language,
    )
    .toArray();
export function rescheduleCard(id: string, card: Vocabulary["card"]) {
  return db.vocabulary
    .where("id")
    .equals(id)
    .modify((current) => {
      current.card = card;
      current.version++;
      current.srsVersion++;
      current.updated = Date.now();
    });
}
export const clearUndo = () => db.srsMeta.update("main", { undo: undefined });

export async function statisticsHistory(
  language: string,
  now: number,
  rolloverHour: number,
) {
  const history: ReviewSummary[] = [];
  const activity = new Map<number, number>();
  const start = dayStart(studyDay(now, rolloverHour) - 29, rolloverHour);
  await db.reviews
    .where("time")
    .between(0, now, true, true)
    .filter(
      (review) => review.active && JSON.parse(review.wordId)[0] === language,
    )
    .each((review) => {
      const day = studyDay(review.time, rolloverHour);
      activity.set(day, (activity.get(day) ?? 0) + 1);
      if (review.time >= start)
        history.push({
          time: review.time,
          rating: review.rating,
          durationMs: review.durationMs,
          state: review.before?.card?.state ?? 0,
        });
    });
  return {
    history,
    activity: [...activity]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day - b.day),
  };
}
