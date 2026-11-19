import type { Settings } from "@/settings/model";
import { db } from "@/platform/database/db";
import type { Review } from "@/srs/history";
import { historyForDay } from "@/srs/storage";
import { dayStart, studyDay } from "@/srs/study-day";

const autoBuryThreshold = 3;

function againStreaks(history: Review[]) {
  const streaks = new Map<string, number>();
  for (const review of [...history].sort(
    (a, b) => a.time - b.time || a.sequence - b.sequence,
  ))
    streaks.set(
      review.cardId,
      review.rating === 1 ? (streaks.get(review.cardId) ?? 0) + 1 : 0,
    );
  return streaks;
}

export async function autoBuriesAfterAgain(
  cardId: string,
  language: string,
  rolloverHour: number,
  now: number,
) {
  const start = dayStart(studyDay(now, rolloverHour), rolloverHour);
  const history = await db.reviews
    .where("[cardId+time]")
    .between([cardId, start], [cardId, now], true, true)
    .filter((review) => review.active && review.language === language)
    .toArray();
  return againStreaks(history).get(cardId) === autoBuryThreshold - 1;
}

export async function dailyCounts(
  settings: Pick<Settings, "studyLanguage" | "rolloverHour"> &
    Partial<Pick<Settings, "autoBuryFailed">>,
  now = Date.now(),
) {
  const start = dayStart(
    studyDay(now, settings.rolloverHour),
    settings.rolloverHour,
  );
  const history = await historyForDay(settings.studyLanguage, start, now);
  return {
    buried: new Set(
      settings.autoBuryFailed
        ? [...againStreaks(history)]
            .filter(([, fails]) => fails >= autoBuryThreshold)
            .map(([id]) => id)
        : [],
    ),
    today: history.length,
    introduced: new Set(
      history
        .filter((review) => !review.before?.schedule?.reps)
        .map((review) => review.cardId),
    ).size,
    reviews: history.filter(
      (review) =>
        review.before?.schedule?.state === 2 ||
        review.before?.schedule?.interday,
    ).length,
  };
}
