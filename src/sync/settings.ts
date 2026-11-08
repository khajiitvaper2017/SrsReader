import { settingsSchema, type Settings } from "@/settings/model";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";

// Appearance, device voices, downloaded parser models and grants stay on this device.
const localOnly: Record<string, true> = {
  studyLanguage: true,
  nativeLanguage: true,
  setupComplete: true,
  theme: true,
  voice: true,
  udpipe: true,
  udpipeModels: true,
  paused: true,
};

export function portableSettings(settings: Settings): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !localOnly[key]),
  );
}

export async function applyPortableSettings(
  current: Settings,
  value: Record<string, unknown>,
): Promise<Settings> {
  // Older snapshots include theme; read them without changing local appearance.
  const { theme: _theme, ...portable } = value;
  const allowed = portableSettings(current);
  for (const key of Object.keys(portable)) {
    if (!Object.hasOwn(allowed, key)) throw new Error("sync_invalid_data");
  }
  // Keep preferences for unavailable dictionaries: installations are local, IDs are portable.
  const next = settingsSchema.parse({ ...current, ...portable });
  if (next.algorithm === "rwkv" && !(await rwkvStatus(next)).ready) {
    next.algorithm = current.algorithm;
  }
  return next;
}
