import type { Settings } from "@/settings/model";
import { allReviewCards } from "@/vocabulary/storage";
import { statisticsHistory } from "@/srs/storage";
import { dayStart, studyDay } from "@/srs/study-day";
import { calendarStatistics } from "@/srs/statistics-calendar";

export type ReviewStatistics = Awaited<ReturnType<typeof reviewStatistics>>;

export async function reviewStatistics(settings: Settings, year?: number) {
  const now = Date.now();
  const today = studyDay(now, settings.rolloverHour);
  const currentYear = new Date(
    dayStart(today, settings.rolloverHour),
  ).getFullYear();
  const selectedYear = year ?? currentYear;
  const [words, { today: summary, activity }] = await Promise.all([
    allReviewCards(),
    statisticsHistory(now, settings.rolloverHour),
  ]);
  return {
    today: summary,
    calendar: calendarStatistics(words, activity, selectedYear, settings, now),
  };
}
