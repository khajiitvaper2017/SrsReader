import { buildFeatures } from "@/srs/engines/rwkv/features";
import { entityKey } from "@/srs/engines/rwkv/model";
import { pack } from "@/srs/engines/rwkv/precision";
import type { RwkvCard, RwkvMeta } from "@/srs/engines/rwkv/records";
import type { loadRwkvState } from "@/srs/engines/rwkv/state";
import type { SchedulingPreferences as Settings } from "@/srs/preferences";
import { studyDay } from "@/srs/study-day";

export function simulateAnswers(
  {
    model,
    meta,
    card,
    ids,
    entities,
    states,
  }: Awaited<ReturnType<typeof loadRwkvState>>,
  wordId: string,
  language: string,
  time: number,
  durationMs: number | null,
  settings: Settings,
) {
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
  return { model, answers, before: { entities, card, meta } };
}
