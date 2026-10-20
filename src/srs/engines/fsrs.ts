import type { Schedule } from "@/srs/model";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";
import { studyDay } from "@/srs/study-day";
import { fsrs, type Grade } from "ts-fsrs";

export function fsrsAnswers(
  card: Schedule,
  now: number,
  retention: number,
  settings: Settings,
) {
  const engine = fsrs({
    request_retention: retention,
    enable_fuzz: false,
    enable_short_term: true,
  });
  const elapsed =
    card.last_review === null
      ? 0
      : Math.max(
          0,
          studyDay(now, settings.rolloverHour) -
            (card.last_review_day ??
              studyDay(card.last_review, settings.rolloverHour)),
        );
  return ([1, 2, 3, 4] as Grade[]).map((rating) => {
    const memory = engine.next_state(
      card.reps ? card.fsrs : null,
      elapsed,
      rating,
    );
    return {
      memory,
      interval:
        memory.stability * engine.calculate_interval_modifier(retention),
    };
  });
}
