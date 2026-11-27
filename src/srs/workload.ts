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
  const byCard = new Map<
    string,
    { introduced: number; reviews: number; failed: boolean }
  >();
  let introduced = 0;
  let reviews = 0;
  for (const review of history) {
    const counts = byCard.get(review.cardId) ?? {
      introduced: 0,
      reviews: 0,
      failed: false,
    };
    if (review.rating === 1) counts.failed = true;
    if (!review.before?.schedule?.reps && !counts.introduced) {
      counts.introduced = 1;
      introduced++;
    }
    if (
      review.before?.schedule?.state === 2 ||
      review.before?.schedule?.interday
    ) {
      counts.reviews++;
      reviews++;
    }
    byCard.set(review.cardId, counts);
  }
  return {
    buried: new Set(
      settings.autoBuryFailed
        ? [...againStreaks(history)]
            .filter(([, fails]) => fails >= autoBuryThreshold)
            .map(([id]) => id)
        : [],
    ),
    today: history.length,
    introduced,
    reviews,
    byCard,
  };
}
