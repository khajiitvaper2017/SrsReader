import type { Settings } from "@/settings/model";
import type { Schedule } from "@/srs/model";
import { dayStart, stepMinutes, studyDay } from "@/srs/study-day";
import { fsrs, type Grade } from "ts-fsrs";

export function emptySchedule(now = Date.now()): Schedule {
  return {
    due: now,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: 0,
    last_review: null,
    last_review_day: null,
    interday: false,
    fsrs: { stability: 0, difficulty: 0 },
  };
}

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
function random(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++)
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
export function reviewIntervals(
  raw: number[],
  settings: Settings,
  seed: string,
  ordered = true,
) {
  const min = settings.minimumInterval,
    max = 36500;
  const result = raw.map((interval, index) => {
    let value = Math.max(min, Math.min(max, interval));
    if (settings.intervalFuzz && value >= 2.5) {
      const delta =
        1 +
        0.15 * Math.max(0, Math.min(value, 7) - 2.5) +
        0.1 * Math.max(0, Math.min(value, 20) - 7) +
        0.05 * Math.max(0, value - 20);
      const low = Math.max(min, Math.round(value - delta)),
        high = Math.min(max, Math.round(value + delta));
      value = low + Math.floor(random(`${seed}:${index}`) * (high - low + 1));
    }
    return Math.max(min, Math.min(max, Math.round(value)));
  });
  if (ordered) {
    result[1] = Math.min(result[1]!, Math.max(min, result[2]! - 1));
    result[2] = Math.min(
      max,
      Math.max(result[2]!, Math.min(max, result[1]! + 1)),
    );
  }
  result[3] = Math.min(
    max,
    Math.max(result[3]!, Math.min(max, result[2]! + 1)),
  );
  return result;
}

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
export function rescheduledDue(
  card: Schedule,
  interval: number,
  settings: Settings,
) {
  return dayStart(
    studyDay(card.last_review!, settings.rolloverHour) + interval,
    settings.rolloverHour,
  );
}
