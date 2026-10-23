import { db } from "@/platform/database/db";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { rwkvInterval } from "@/srs/engines/rwkv/interval";
import { loadRwkvState } from "@/srs/engines/rwkv/state";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { specHash, weightHash } from "@/srs/engines/rwkv/assets";
import type { Settings } from "@/settings/model";
import { reviewIntervals } from "@/srs/intervals";
import { effectiveRetention } from "@/srs/retention";
import { rescheduleCard } from "@/srs/storage";
import { rescheduledDue } from "@/srs/study-day";
import { fsrs } from "ts-fsrs";

const schedulingModel = (settings: Settings) =>
  settings.algorithm === "fsrs"
    ? "ts-fsrs@5.4.2/FSRS-6"
    : `${weightHash}:${specHash}:${settings.rwkvMode}`;

export async function requireScheduledModel(settings: Settings) {
  if (settings.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  if (
    (await db.srsMeta.get("main"))?.scheduledModel !== schedulingModel(settings)
  )
    throw Object.assign(new Error(t("srs_rescheduling", { count: 0 })), {
      code: "SRS_RESCHEDULE_REQUIRED",
    });
}

export async function rescheduleModel() {
  const settings = await getSettings();
  const model = schedulingModel(settings);
  const meta = await db.srsMeta.get("main");
  if (meta?.scheduledModel === model) return { count: 0, cursor: null };
  const pending =
    meta?.reschedule?.model === model ? meta.reschedule : undefined;
  const result = await rescheduleExisting(pending?.after ?? "", true);
  const count = (pending?.count ?? 0) + result.count;
  await db.srsMeta.put({
    ...meta,
    id: "main",
    sequence: meta?.sequence ?? 0,
    scheduledModel: result.cursor ? meta?.scheduledModel : model,
    reschedule: result.cursor
      ? { model, after: result.cursor, count }
      : undefined,
    undo: undefined,
  });
  return { count, cursor: result.cursor };
}

export async function rescheduleExisting(
  after = "",
  allCards = false,
  language?: string,
) {
  const settings = await getSettings();
  if (settings.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  const instant =
    settings.algorithm === "rwkv" && settings.rwkvMode === "instant";
  const batchSize = instant ? 10 : 100;
  const now = Date.now();
  const words = await db.vocabulary
    .where("id")
    .above(after)
    .filter(
      (word) =>
        (allCards ||
          (word.language === language && !word.known && !word.suspended)) &&
        word.card?.state === 2 &&
        word.card.last_review !== null,
    )
    .limit(batchSize)
    .toArray();
  for (const word of words) {
    const retention = await effectiveRetention(word, settings);
    let interval: number;
    if (settings.algorithm === "rwkv") {
      const state = await loadRwkvState(word.id, word.language, settings);
      if (!state.card) throw new Error(t("rwkv_not_ready"));
      interval = rwkvInterval(
        state.model,
        { ...state, card: state.card },
        word.language,
        retention,
        settings,
        now,
      );
    } else {
      interval =
        word.card!.fsrs.stability *
        fsrs().calculate_interval_modifier(retention);
    }
    const days = reviewIntervals(
      [interval, interval, interval, interval],
      settings,
      `${word.id}:${word.card!.reps}`,
    )[0]!;
    const card = {
      ...word.card!,
      scheduled_days: days,
      due: rescheduledDue(word.card!, days, settings),
    };
    await rescheduleCard(word.id, card);
  }
  return {
    count: words.length,
    cursor: words.length === batchSize ? words.at(-1)!.id : null,
  };
}
