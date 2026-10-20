import type { Schedule } from "@/srs/model";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";
import { dayStart, stepMinutes, studyDay } from "@/srs/study-day";

export function scheduleAnswers(
  card: Schedule,
  memories: Schedule["fsrs"][],
  intervals: number[],
  now: number,
  settings: Settings,
) {
  const today = studyDay(now, settings.rolloverHour);
  return [1, 2, 3, 4].map((rating, index): Schedule => {
    const lapse = card.state === 2 && rating === 1;
    const next: Schedule = {
      ...card,
      fsrs: memories[index]!,
      reps: card.reps + 1,
      lapses: card.lapses + Number(lapse),
      last_review: now,
      last_review_day: today,
      interday: false,
      learning_steps: 0,
      state: 2,
      scheduled_days: intervals[index]!,
      due: dayStart(today + intervals[index]!, settings.rolloverHour),
    };
    const learning = card.state !== 2 || lapse;
    const steps = (
      card.state === 3 || lapse
        ? settings.relearningSteps
        : settings.learningSteps
    ).map(stepMinutes);
    if (!learning || !steps.length || rating === 4) return next;
    let step =
      card.state === 0 || lapse
        ? 0
        : Math.min(card.learning_steps, steps.length - 1);
    let minutes: number;
    if (rating === 1) {
      step = 0;
      minutes = steps[0]!;
    } else if (rating === 2)
      minutes =
        step === 0
          ? steps.length === 1
            ? steps[0]! * 1.5
            : (steps[0]! + steps[1]!) / 2
          : steps[step]!;
    else {
      step++;
      if (step >= steps.length) return next;
      minutes = steps[step]!;
    }
    next.state = card.state === 3 || lapse ? 3 : 1;
    next.learning_steps = step;
    const target = now + minutes * 60000;
    const targetDay = studyDay(target, settings.rolloverHour);
    next.interday = targetDay > today;
    next.scheduled_days = next.interday ? targetDay - today : 0;
    next.due = next.interday
      ? dayStart(targetDay, settings.rolloverHour)
      : target;
    return next;
  });
}
