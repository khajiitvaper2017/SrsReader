import type { Settings } from "@/settings/model";
import { historyForDay } from "@/srs/storage";
import { dayStart, studyDay } from "@/srs/study-day";

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
  const streaks = new Map<string, number>();
  if (settings.autoBuryFailed)
    for (const review of [...history].sort(
      (a, b) => a.time - b.time || a.sequence - b.sequence,
    ))
      streaks.set(
        review.cardId,
        review.rating === 1 ? (streaks.get(review.cardId) ?? 0) + 1 : 0,
      );
  return {
    buried: new Set(
      [...streaks].filter(([, fails]) => fails >= 3).map(([id]) => id),
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
