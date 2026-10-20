import type { Settings } from "@/settings/model";
import { historyForDay } from "@/srs/storage";
import { dayStart, studyDay } from "@/srs/study-day";

export async function dailyCounts(
  settings: Pick<Settings, "studyLanguage" | "rolloverHour">,
  now = Date.now(),
) {
  const start = dayStart(
    studyDay(now, settings.rolloverHour),
    settings.rolloverHour,
  );
  const history = await historyForDay(settings.studyLanguage, start, now);
  return {
    today: history.length,
    introduced: new Set(
      history
        .filter((review) => !review.before?.card?.reps)
        .map((review) => review.wordId),
    ).size,
    reviews: history.filter(
      (review) =>
        review.before?.card?.state === 2 || review.before?.card?.interday,
    ).length,
  };
}
