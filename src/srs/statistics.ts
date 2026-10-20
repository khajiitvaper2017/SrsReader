import type { Settings } from "@/settings/model";
import type { ReviewSummary } from "@/srs/history";
import { statisticsHistory } from "@/srs/storage";
import { dayStart, studyDay } from "@/srs/study-day";
import type { Vocabulary } from "@/vocabulary/model";
import { calendarStatistics } from "@/srs/statistics-calendar";
import { languageWords } from "@/vocabulary/storage";

export function calculateStatistics(
  words: Vocabulary[],
  history: ReviewSummary[],
  settings: Settings,
  now: number,
) {
  const today = studyDay(now, settings.rolloverHour);
  const start = dayStart(today - 29, settings.rolloverHour);
  const reviews = history.filter(
    (review) => review.time >= start && review.time <= now,
  );
  const collection = words.filter(
    (word) => word.language === settings.studyLanguage,
  );
  const active = collection.filter(
    (word) => word.card && !word.known && !word.suspended,
  );
  const phases = [0, 1, 2, 3].map(
    (phase) => active.filter((word) => word.card!.state === phase).length,
  );
  const normal = reviews.filter((review) => review.state === 2);
  const forecast = Array.from({ length: 30 }, (_, offset) => ({
    time: dayStart(today + offset, settings.rolloverHour),
    count: 0,
  }));
  for (const word of active) {
    if (word.card!.state === 0) continue;
    const offset = Math.max(
      0,
      studyDay(word.card!.due, settings.rolloverHour) - today,
    );
    if (offset < forecast.length) forecast[offset]!.count++;
  }
  const todayReviews = reviews.filter(
    (review) => studyDay(review.time, settings.rolloverHour) === today,
  );
  return {
    today: {
      answers: todayReviews.length,
      durationMs: todayReviews.reduce(
        (sum, review) => sum + (review.durationMs ?? 0),
        0,
      ),
      timedAnswers: todayReviews.filter((review) => review.durationMs !== null)
        .length,
    },
    total: collection.length,
    known: collection.filter((word) => word.known).length,
    suspended: collection.filter((word) => word.suspended && !word.known)
      .length,
    fresh: phases[0]!,
    learning: phases[1]!,
    reviews: phases[2]!,
    relearning: phases[3]!,
    answers: reviews.length,
    studyDays: new Set(
      reviews.map((review) => studyDay(review.time, settings.rolloverHour)),
    ).size,
    durationMs: reviews.reduce(
      (sum, review) => sum + (review.durationMs ?? 0),
      0,
    ),
    timedAnswers: reviews.filter((review) => review.durationMs !== null).length,
    recall: normal.length
      ? normal.filter((review) => review.rating !== 1).length / normal.length
      : null,
    normalAnswers: normal.length,
    ratings: [1, 2, 3, 4].map(
      (rating) => reviews.filter((review) => review.rating === rating).length,
    ),
    forecast,
  };
}

export type ReviewStatistics = Awaited<ReturnType<typeof reviewStatistics>>;

export async function reviewStatistics(settings: Settings, year?: number) {
  const now = Date.now();
  const today = studyDay(now, settings.rolloverHour);
  const currentYear = new Date(
    dayStart(today, settings.rolloverHour),
  ).getFullYear();
  const selectedYear = year ?? currentYear;
  const [words, { history, activity }] = await Promise.all([
    languageWords(settings.studyLanguage),
    statisticsHistory(settings.studyLanguage, now, settings.rolloverHour),
  ]);
  return {
    ...calculateStatistics(words, history, settings, now),
    calendar: calendarStatistics(words, activity, selectedYear, settings, now),
  };
}
