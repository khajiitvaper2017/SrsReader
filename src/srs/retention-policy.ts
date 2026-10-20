import type { SchedulingPreferences } from "@/srs/preferences";

export function resolveRetention(
  override: number | null | undefined,
  rank: number | null,
  preferences: SchedulingPreferences,
) {
  if (override != null) return override;
  if (!preferences.dynamicRetention || rank === null)
    return preferences.retention;
  return preferences.retentionBands.find(
    (band) => band.upTo === null || rank <= band.upTo,
  )!.retention;
}
