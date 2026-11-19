import { db } from "@/platform/database/db";
import { cardDeckPreferences } from "@/srs/preferences";
import { deckReviewSettingsForCards } from "@/srs/decks";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { rwkvInterval } from "@/srs/engines/rwkv/interval";
import { loadRwkvState } from "@/srs/engines/rwkv/state";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { specHash, weightHash } from "@/srs/engines/rwkv/assets";
import type { Settings } from "@/settings/model";
import type { Card } from "@/cards/model";
import { effectiveRetention } from "@/srs/retention";
import { rescheduleCard } from "@/srs/storage";
import { scheduleSchema, type Schedule } from "@/srs/model";
import {
  fsrsConfig,
  createScheduler,
  toFsrsCard,
  fsrsScheduler,
} from "@/srs/scheduler";
import { Reschedule } from "ts-fsrs/reschedule";
import { reviewCards } from "@/vocabulary/storage";
import { deckIdsInTree } from "@/srs/deck-tree";
import { recalculateLapses } from "@/srs/lapses";

const schedulingModel = (settings: Settings) =>
  settings.algorithm === "fsrs"
    ? fsrsScheduler(settings.fsrsVersion)
    : `${weightHash}:${specHash}:${settings.rwkvMode}`;

async function fsrsHistory(id: string, schedule: Schedule) {
  const reviews = await db.reviews
    .where("cardId")
    .equals(id)
    .filter((review) => review.active)
    .toArray();
  reviews.sort((a, b) => a.time - b.time || a.sequence - b.sequence);
  const history = [];
  let previous: Schedule | null = null;
  const start = reviews.findLastIndex(
    (review) =>
      review.before &&
      (review.before.schedule === null ||
        scheduleSchema.safeParse(review.before.schedule).data?.state === 0),
  );
  if (start === -1) return null;
  for (const review of reviews.slice(start)) {
    const before = review.before?.schedule
      ? scheduleSchema.safeParse(review.before.schedule)
      : null;
    const after = scheduleSchema.safeParse(review.after);
    if (!review.before || (before && !before.success)) return null;
    const prior = before?.data ?? null;
    if (
      !after.success ||
      !Number.isFinite(review.time) ||
      Math.abs(review.time) > 8640000000000000 ||
      ![1, 2, 3, 4].includes(review.rating) ||
      after.data.lastReviewAt !== review.time ||
      after.data.reps !== (prior?.reps ?? 0) + 1 ||
      (previous &&
        (prior?.lastReviewAt !== previous.lastReviewAt ||
          prior.reps !== previous.reps ||
          review.time < previous.lastReviewAt!))
    )
      return null;
    history.push({
      rating: review.rating as 1 | 2 | 3 | 4,
      reviewTime: new Date(review.time),
    });
    previous = after.data;
  }
  return history.length &&
    previous?.lastReviewAt === schedule.lastReviewAt &&
    previous.reps === schedule.reps
    ? history
    : null;
}

export async function previewFsrsMigration(version: Settings["fsrsVersion"]) {
  let eligible = 0,
    skipped = 0;
  for (const card of await db.cards.toArray()) {
    const schedule = card.schedule;
    if (!schedule || schedule.fsrs.version === version) continue;
    if (schedule.state === 0 || (await fsrsHistory(card.id, schedule)))
      eligible++;
    else skipped++;
  }
  return { eligible, skipped };
}

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

async function migrateFsrsBatch(after: string, settings: Settings) {
  const cards = await db.cards
    .where("id")
    .above(after)
    .filter(
      (card) =>
        card.schedule !== null &&
        card.schedule.fsrs.version !== settings.fsrsVersion,
    )
    .limit(100)
    .toArray();
  let count = 0,
    skipped = 0;
  for (const card of cards) {
    const schedule = card.schedule!;
    if (schedule.state === 0) {
      await rescheduleCard(card.id, {
        ...schedule,
        stability: 0,
        difficulty: 0,
        stabilityFast: settings.fsrsVersion === "7" ? 0 : undefined,
        fsrs: fsrsConfig(settings.fsrsVersion),
      });
      count++;
      continue;
    }
    const history = await fsrsHistory(card.id, schedule);
    if (!history) {
      skipped++;
      continue;
    }
    const memory = new Reschedule(
      createScheduler(settings, settings.retention),
    ).replay({ history }, { sortHistory: false }).memoryState;
    const { stabilityFast: _oldFast, ...before } = schedule;
    await rescheduleCard(card.id, {
      ...before,
      ...memory,
      fsrs: fsrsConfig(settings.fsrsVersion),
    });
    count++;
  }
  return {
    count,
    skipped,
    cursor: cards.length === 100 ? cards.at(-1)!.id : null,
  };
}

export async function rescheduleModel() {
  const settings = await getSettings();
  const model = schedulingModel(settings);
  const meta = await db.srsMeta.get("main");
  if (meta?.scheduledModel === model)
    return {
      count: 0,
      skipped:
        meta.fsrsMigration?.model === model ? meta.fsrsMigration.skipped : 0,
      cursor: null,
    };
  const pending =
    meta?.reschedule?.model === model ? meta.reschedule : undefined;
  const result =
    settings.algorithm === "fsrs"
      ? await migrateFsrsBatch(pending?.after ?? "", settings)
      : {
          ...(await rescheduleExisting(pending?.after ?? "", true)),
          skipped: 0,
        };
  const count = (pending?.count ?? 0) + result.count;
  const skipped = (pending?.skipped ?? 0) + result.skipped;
  await db.srsMeta.put({
    ...meta,
    id: "main",
    sequence: meta?.sequence ?? 0,
    scheduledModel: result.cursor ? meta?.scheduledModel : model,
    reschedule: result.cursor
      ? { model, after: result.cursor, count, skipped }
      : undefined,
    fsrsMigration:
      settings.algorithm === "fsrs" ? { model, skipped } : undefined,
    undo: undefined,
  });
  return { count, skipped, cursor: result.cursor };
}

export async function rescheduleExisting(
  after = "",
  allCards = false,
  language?: string,
  deckId?: string,
) {
  const settings = await getSettings();
  if (settings.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  const batchSize =
    settings.algorithm === "rwkv" && settings.rwkvMode === "instant" ? 10 : 100;
  const now = Date.now();
  const deckIds =
    deckId && deckId !== "mined"
      ? new Set(
          deckIdsInTree(
            await db.decks.where("language").equals(language!).toArray(),
            deckId,
          ),
        )
      : undefined;
  if (!allCards && !after) {
    const selected = await db.cards
      .where("language")
      .equals(language!)
      .filter(
        (card) =>
          !deckId ||
          (deckId === "mined"
            ? card.deckId === null
            : deckIds!.has(card.deckId!)),
      )
      .primaryKeys();
    await recalculateLapses(selected);
  }
  const cards: Card[] = await db.cards
    .where("id")
    .above(after)
    .filter(
      (card) =>
        (allCards || (card.language === language && !card.suspended)) &&
        (!deckId ||
          (deckId === "mined"
            ? card.deckId === null
            : deckIds!.has(card.deckId!))) &&
        card.schedule?.state === 2 &&
        card.schedule.lastReviewAt !== null,
    )
    .limit(batchSize)
    .toArray();
  const words = (await reviewCards(cards)).filter(
    (word) => allCards || !word.known,
  );
  const options = await deckReviewSettingsForCards(cards);
  for (const word of words) {
    const preferences = cardDeckPreferences(
      settings,
      word.document.card,
      options.get(word.document.card.deckId ?? ""),
    );
    const retention = await effectiveRetention(word, preferences);
    let intervals: number[] | undefined;
    if (settings.algorithm === "rwkv") {
      const state = await loadRwkvState(word.id, word.language, settings);
      if (!state.card) throw new Error(t("rwkv_not_ready"));
      const interval = rwkvInterval(
        state.model,
        { ...state, card: state.card },
        word.language,
        retention,
        preferences,
        now,
      );
      intervals = [interval, interval, interval, interval];
    }
    const card = word.card!;
    const scheduler = createScheduler(
      { ...preferences, learningSteps: [], relearningSteps: [] },
      retention,
      card.fsrs,
      intervals,
    );
    const input = toFsrsCard(word.id, card, card.fsrs);
    const days = Math.max(
      Math.min(preferences.minimumInterval, preferences.maximumInterval),
      scheduler.nextInterval(input, retention, {
        card: input,
        grade: 1,
        elapsedDays: 0,
      }),
    );
    await rescheduleCard(word.id, {
      ...card,
      scheduledDays: days,
      dueAt: scheduler.chrono.add(new Date(card.lastReviewAt!), days).getTime(),
    });
  }
  return {
    count: words.length,
    cursor: cards.length === batchSize ? cards.at(-1)!.id : null,
  };
}
