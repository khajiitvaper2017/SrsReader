import { t } from "@/shared/i18n/i18n";
import { loadModel } from "@/srs/engines/rwkv/assets";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { buildFeatures } from "@/srs/engines/rwkv/features";
import { entityKey, type EntityStates } from "@/srs/engines/rwkv/model";
import { pack, unpack } from "@/srs/engines/rwkv/precision";
import type {
  RwkvCard,
  RwkvEntity,
  RwkvMeta,
} from "@/srs/engines/rwkv/records";
import {
  invalidateRwkv,
  loadCard,
  loadEntities,
  loadMeta,
  replayedReview,
} from "@/srs/engines/rwkv/storage";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";
import { studyDay } from "@/srs/study-day";

export async function simulateAnswers(
  wordId: string,
  language: string,
  time: number,
  durationMs: number | null,
  settings: Settings,
) {
  if (!(await rwkvStatus(settings)).ready)
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  const model = await loadModel();
  const meta = (await loadMeta())!;
  const card = await loadCard(wordId);
  const ids = [wordId, language, wordId, "main", "main"];
  const keys = ids.map((id, stream) => entityKey(stream, id));
  const existing = (await loadEntities(keys)).filter(
    (entity): entity is RwkvEntity => !!entity,
  );
  if (
    (card && existing.length !== ids.length) ||
    (!card && (await replayedReview(wordId, meta.cursor)))
  ) {
    await invalidateRwkv();
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  }
  const states: EntityStates = new Map(
    existing.map((entity) => [entity.id, unpack(entity.state)]),
  );
  const answers = [1, 2, 3, 4].map((rating) => {
    const row = buildFeatures(
      {
        wordId,
        language,
        time,
        day: studyDay(time, settings.rolloverHour),
        rating,
        durationMs,
      },
      card?.features,
      meta.features,
    );
    const result = model.step(row.features, ids, states);
    return {
      heads: result.heads,
      entities: ids.map((id, stream) => {
        const key = entityKey(stream, id);
        return {
          id: key,
          state: pack(result.states.get(key)!, stream === 0 || stream === 2),
        };
      }),
      card: {
        id: wordId,
        features: row.card,
        curve: { w: result.heads.w, s: result.heads.s, d: result.heads.d },
      } satisfies RwkvCard,
      meta: { ...meta, features: row.global } satisfies RwkvMeta,
    };
  });
  return { model, answers, before: { entities: existing, card, meta } };
}
