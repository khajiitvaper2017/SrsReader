import type { SchedulingPreferences as Settings } from "@/srs/preferences";

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
