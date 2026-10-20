import type { Schedule } from "@/srs/model";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";

export const DAY = 86400000;

export function studyDay(time: number, rolloverHour: number) {
  const date = new Date(time);
  if (date.getHours() < rolloverHour) date.setDate(date.getDate() - 1);
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY,
  );
}

export function dayStart(day: number, rolloverHour: number) {
  const date = new Date(day * DAY);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    rolloverHour,
  ).getTime();
}

export function stepMinutes(step: string) {
  return parseFloat(step) * ({ m: 1, h: 60, d: 1440 }[step.at(-1)!] ?? 1);
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
