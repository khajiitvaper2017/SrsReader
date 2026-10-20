import {
  assetUrl,
  cacheName,
  specHash,
  weightHash,
} from "@/srs/engines/rwkv/assets";
import { loadMeta, reviewSequence } from "@/srs/engines/rwkv/storage";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";

export const cacheKey = (settings: Settings) =>
  JSON.stringify([
    weightHash,
    specHash,
    "w8-s8-features-v1",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    settings.rolloverHour,
  ]);

export async function rwkvStatus(settings: Settings) {
  const meta = await loadMeta();
  const total = await reviewSequence();
  const cache = await caches.open(cacheName);
  const downloaded = !!(await cache.match(assetUrl("weights.int8.bin")));
  const processed = meta?.key === cacheKey(settings) ? meta.cursor : 0;
  return {
    downloaded,
    processed,
    total,
    ready:
      downloaded &&
      !!meta &&
      meta.key === cacheKey(settings) &&
      processed === total,
  };
}
