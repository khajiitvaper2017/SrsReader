import { t } from "@/shared/i18n/i18n";
import { loadModel } from "@/srs/engines/rwkv/assets";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { entityKey, type EntityStates } from "@/srs/engines/rwkv/model";
import { unpack } from "@/srs/engines/rwkv/precision";
import type { RwkvEntity } from "@/srs/engines/rwkv/records";
import {
  invalidateRwkv,
  loadCard,
  loadEntities,
  loadMeta,
  replayedReview,
} from "@/srs/engines/rwkv/storage";
import type { SchedulingPreferences } from "@/srs/preferences";

export async function loadRwkvState(
  wordId: string,
  language: string,
  settings: SchedulingPreferences,
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
    (!card && (await replayedReview(wordId)))
  ) {
    await invalidateRwkv();
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  }
  const states: EntityStates = new Map(
    existing.map((entity) => [entity.id, unpack(entity.state)]),
  );
  return { model, meta, card, ids, entities: existing, states };
}
