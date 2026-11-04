import type { Settings } from "@/settings/model";
import { DAY, dayStart, studyDay } from "@/srs/study-day";
import type { ReviewWord } from "@/vocabulary/model";

export function calendarStatistics(
  words: ReviewWord[],
  history: { day: number; count: number }[],
  year: number,
  settings: Settings,
  now: number,
) {
  const today = studyDay(now, settings.rolloverHour);
  const start = Math.floor(Date.UTC(year, 0, 1) / DAY);
  const end = Math.floor(Date.UTC(year + 1, 0, 1) / DAY);
  const days = Array.from({ length: end - start }, (_, index) => ({
    day: start + index,
    time: dayStart(start + index, settings.rolloverHour),
    studied: 0,
    due: 0,
  }));
  for (const review of history) {
    const entry = days[review.day - start];
    if (entry) entry.studied = review.count;
  }
  for (const word of words) {
    if (word.known || word.suspended || !word.card || word.card.state === 0)
      continue;
    const day = Math.max(
      today,
      studyDay(word.card.dueAt, settings.rolloverHour),
    );
    const entry = days[day - start];
    if (entry) entry.due++;
  }
  const total = history.reduce((sum, day) => sum + day.count, 0);
  const first = history[0]?.day;
  const period = first === undefined ? 0 : today - first + 1;
  let longest = 0,
    run = 0,
    previous: number | undefined;
  for (const entry of history) {
    run = entry.day === (previous ?? -Infinity) + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = entry.day;
  }
  const current = previous === today || previous === today - 1 ? run : 0;
  return {
    year,
    currentYear: new Date(dayStart(today, settings.rolloverHour)).getFullYear(),
    today,
    days,
    average: history.length ? total / history.length : 0,
    learned: period ? history.length / period : 0,
    longest,
    current,
  };
}
