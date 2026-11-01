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
