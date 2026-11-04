import { scheduleSchema } from "@/srs/model";
import { downloadModel, loadModel } from "@/srs/engines/rwkv/assets";
import { cacheKey, rwkvStatus } from "@/srs/engines/rwkv/cache";
import { buildFeatures, emptyFeatures } from "@/srs/engines/rwkv/features";
import { entityKey, type EntityStates } from "@/srs/engines/rwkv/model";
import { pack, unpack } from "@/srs/engines/rwkv/precision";
import type { RwkvCard, RwkvEntity } from "@/srs/engines/rwkv/records";
import {
  commitReplay,
  loadCard,
  loadEntities,
  loadMeta,
  replayHistory,
  resetReplay,
  reviewSequence,
} from "@/srs/engines/rwkv/storage";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";
import { studyDay } from "@/srs/study-day";

export async function replayBatch(settings: Settings) {
  await downloadModel();
  const model = await loadModel();
  let meta = await loadMeta();
  if (!meta || meta.key !== cacheKey(settings)) {
    meta = {
      id: "main",
      key: cacheKey(settings),
      cursor: 0,
      features: emptyFeatures(),
    };
    await resetReplay(meta);
  }
  const current = structuredClone(meta!);
  const target = await reviewSequence();
  const history = await replayHistory(current.cursor);
  const entities = new Map<string, RwkvEntity>();
  const cards = new Map<string, RwkvCard>();
  const started = performance.now();
  for (const review of history) {
    if (review.active) {
      const language = review.language;
      const old = cards.get(review.cardId) ?? (await loadCard(review.cardId));
      const row = buildFeatures(
        {
          wordId: review.cardId,
          language,
          time: review.time,
          day:
            (review.after
              ? scheduleSchema.parse(review.after).lastReviewDay
              : null) ?? studyDay(review.time, settings.rolloverHour),
          rating: review.rating,
          durationMs: review.durationMs,
        },
        old?.features,
        current.features,
      );
      const keys = row.ids.map((id, stream) => entityKey(stream, id));
      const missing = keys.filter((key) => !entities.has(key));
      for (const entity of await loadEntities(missing))
        if (entity) entities.set(entity.id, entity);
      const states: EntityStates = new Map();
      for (const key of keys) {
        const entity = entities.get(key);
        if (entity) states.set(key, unpack(entity.state));
      }
      const result = model.step(row.features, row.ids, states);
      for (const [stream, id] of row.ids.entries()) {
        const key = entityKey(stream, id);
        entities.set(key, {
          id: key,
          state: pack(result.states.get(key)!, stream === 0 || stream === 2),
        });
      }
      cards.set(review.cardId, {
        id: review.cardId,
        features: row.card,
        curve: { w: result.heads.w, s: result.heads.s, d: result.heads.d },
      });
      current.features = row.global;
    }
    current.cursor++;
    if (performance.now() - started >= 150) break;
  }
  if (!history.length || current.cursor >= target) current.cursor = target;
  await commitReplay(entities, cards, current);
  return rwkvStatus(settings);
}
