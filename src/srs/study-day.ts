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
