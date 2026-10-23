import { buildFeatures } from "@/srs/engines/rwkv/features";
import type { EntityStates, RwkvModel } from "@/srs/engines/rwkv/model";
import { unpack } from "@/srs/engines/rwkv/precision";
import type {
  RwkvCard,
  RwkvEntity,
  RwkvMeta,
} from "@/srs/engines/rwkv/records";
import type { SchedulingPreferences } from "@/srs/preferences";
import { dayStart, studyDay } from "@/srs/study-day";

export function rwkvInterval(
  model: RwkvModel,
  memory: { card: RwkvCard; meta: RwkvMeta; entities: RwkvEntity[] },
  language: string,
  retention: number,
  settings: SchedulingPreferences,
  now = memory.card.features.lastTime,
) {
  const curveInterval = model.interval(memory.card.curve, retention);
  if (settings.rwkvMode === "curve") return curveInterval;

  const card = memory.card.features;
  const global = memory.meta.features;
  const states: EntityStates = new Map(
    memory.entities.map((entity) => [entity.id, unpack(entity.state)]),
  );
  const minimum = Math.min(
    36500,
    Math.max(
      settings.minimumInterval,
      studyDay(now, settings.rolloverHour) - card.lastDay,
      (global.previousDay ?? card.lastDay) - card.lastDay,
    ),
  );
  // Instant predictions need not decay to the target; the curve bounds the search.
  const maximum = Math.max(minimum, Math.ceil(curveInterval));
  const recall = (days: number) => {
    const day = card.lastDay + days;
    const row = buildFeatures(
      {
        wordId: memory.card.id,
        language,
        time: dayStart(day, settings.rolloverHour),
        day,
        rating: 0,
        durationMs: null,
      },
      card,
      global,
      true,
    );
    // Every query starts from the same state. Its output state is discarded.
    return (
      1 - model.instant(model.step(row.features, row.ids, states).heads)[0]!
    );
  };

  let low = minimum - 1;
  let high = minimum;
  // shortcut: sampled dates can miss brief recall dips; use a full day grid if exact first crossings are needed.
  while (recall(high) > retention) {
    if (high === maximum) return Math.max(minimum, curveInterval);
    low = high;
    high = Math.min(maximum, Math.max(high + 1, Math.ceil(high * 1.5)));
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (recall(middle) > retention) low = middle;
    else high = middle;
  }
  return Math.max(minimum, Math.min(high, curveInterval));
}
