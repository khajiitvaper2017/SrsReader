import { orderNewWords } from "@/dictionaries/frequency";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { db } from "@/shared/db";
import { t } from "@/shared/i18n/i18n";
import { effectiveRetention } from "@/srs/retention";
import { entityKey } from "@/srs/rwkv/model";
import {
  invalidateRwkv,
  loadModel,
  rwkvStatus,
  simulateAnswers,
} from "@/srs/rwkv/runtime";
import {
  emptySchedule,
  fsrsAnswers,
  rescheduledDue,
  reviewIntervals,
  scheduleAnswers,
} from "@/srs/scheduling";
import { dayStart, studyDay } from "@/srs/study-day";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { addContext, freshWord } from "@/vocabulary/service";
import { fsrs, type Grade } from "ts-fsrs";

async function candidates(
  word: Vocabulary,
  settings: Settings,
  now: number,
  durationMs: number | null,
) {
  const card = word.card ?? emptySchedule(now);
  const retention = await effectiveRetention(word, settings);
  const fsrs = fsrsAnswers(card, now, retention, settings);
  const neural =
    settings.algorithm === "rwkv"
      ? await simulateAnswers(word.id, word.language, now, durationMs, settings)
      : undefined;
  const raw = neural
    ? neural.answers.map((answer) =>
        neural.model.interval(answer.heads, retention),
      )
    : fsrs.map((answer) => answer.interval);
  const intervals = reviewIntervals(
    raw,
    settings,
    `${word.id}:${card.reps}`,
    card.state === 2 ||
      (card.state === 3 ? settings.relearningSteps : settings.learningSteps)
        .length === 0,
  );
  return {
    schedules: scheduleAnswers(
      card,
      fsrs.map((answer) => answer.memory),
      intervals,
      now,
      settings,
    ),
    retention,
    neural,
  };
}

export async function grade(
  word: LookupWord,
  rating: Grade,
  source: "reading" | "review",
  expectedVersion: number,
  context?: ReadingContext,
  durationMs: number | null = null,
  now = Date.now(),
) {
  const settings = await getSettings();
  const before = await db.vocabulary.get(word.id);
  if ((before?.srsVersion ?? 0) !== expectedVersion)
    throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
  if (before?.known)
    throw new Error(t("unmaster_this_word_before_reviewing_it"));
  if (before?.suspended)
    throw new Error(t("resume_this_word_before_grading_it"));
  const saved = structuredClone(before ?? freshWord(word));
  addContext(saved, context);
  const result = await candidates(saved, settings, now, durationMs);
  saved.card = result.schedules[rating - 1]!;
  const threshold = settings.leechThreshold;
  if (
    threshold &&
    before?.card?.state === 2 &&
    rating === 1 &&
    saved.card.lapses >= threshold &&
    (saved.card.lapses - threshold) % Math.max(1, Math.ceil(threshold / 2)) ===
      0
  ) {
    saved.leech = true;
    if (settings.leechAction === "suspend") saved.suspended = true;
  }
  saved.updated = now;
  saved.version++;
  saved.srsVersion++;
  const id = crypto.randomUUID();
  await db.transaction(
    "rw",
    [
      db.vocabulary,
      db.reviews,
      db.srsMeta,
      db.rwkvMeta,
      db.rwkvEntities,
      db.rwkvCards,
    ],
    async () => {
      const current = await db.vocabulary.get(word.id);
      if ((current?.srsVersion ?? 0) !== expectedVersion)
        throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
      // Metadata writes can finish while the model calculates an answer.
      if (current) {
        saved.meanings = current.meanings;
        saved.contexts = current.contexts;
        addContext(saved, context);
        saved.version = current.version + 1;
      }
      const sequence = ((await db.srsMeta.get("main"))?.sequence ?? 0) + 1;
      await db.vocabulary.put(saved);
      await db.reviews.put({
        id,
        wordId: word.id,
        time: now,
        rating,
        source,
        before: before ?? null,
        afterVersion: saved.version,
        afterSrsVersion: saved.srsVersion,
        after: saved.card,
        log: {},
        scheduler:
          settings.algorithm === "fsrs"
            ? "ts-fsrs@5.4.2/FSRS-6"
            : "rwkv-sm40v2-w8-s8",
        retention: result.retention,
        durationMs,
        sequence,
        active: true,
      });
      const neural = result.neural;
      if (neural) {
        const answer = neural.answers[rating - 1]!;
        await db.rwkvEntities.bulkPut(answer.entities);
        await db.rwkvCards.put(answer.card);
        await db.rwkvMeta.put({ ...answer.meta, cursor: sequence });
      }
      await db.srsMeta.put({
        id: "main",
        sequence,
        undo: neural ? { reviewId: id, ...neural.before } : undefined,
      });
    },
  );
  return { word: saved, reviewId: id };
}

export async function undoReview(id: string) {
  return db.transaction(
    "rw",
    [
      db.vocabulary,
      db.reviews,
      db.srsMeta,
      db.rwkvMeta,
      db.rwkvEntities,
      db.rwkvCards,
    ],
    async () => {
      const review = await db.reviews.get(id);
      const last = await db.reviews
        .orderBy("sequence")
        .reverse()
        .filter((review) => review.active)
        .first();
      if (!review?.active || last?.id !== id)
        throw new Error(t("undo_latest_only"));
      const current = await db.vocabulary.get(review.wordId);
      if (!current || current.srsVersion !== review.afterSrsVersion)
        throw new Error(t("this_word_changed_after_that_review_and_cannot"));
      await db.vocabulary.put({
        ...current,
        card: review.before?.card ?? null,
        known: review.before?.known ?? false,
        suspended: review.before?.suspended ?? false,
        leech: review.before?.leech ?? false,
        srsVersion: current.srsVersion + 1,
        version: current.version + 1,
        updated: Date.now(),
      });
      await db.reviews.update(id, { active: false });
      const meta = await db.srsMeta.get("main");
      if (meta?.undo?.reviewId === id) {
        const undo = meta.undo;
        const ids = [
          review.wordId,
          current.language,
          review.wordId,
          "main",
          "main",
        ];
        await db.rwkvEntities.bulkDelete(
          ids.map((id, stream) => entityKey(stream, id)),
        );
        await db.rwkvEntities.bulkPut(undo.entities);
        if (undo.card) await db.rwkvCards.put(undo.card);
        else await db.rwkvCards.delete(review.wordId);
        await db.rwkvMeta.put({ ...undo.meta, cursor: meta.sequence });
      } else await invalidateRwkv();
      if (meta) await db.srsMeta.put({ id: "main", sequence: meta.sequence });
      return review.wordId;
    },
  );
}

export async function preview(
  word: Vocabulary | undefined,
  durationMs: number | null = null,
  id?: string,
) {
  if (!word && id) {
    const [language, lemma, reading] = JSON.parse(id) as string[];
    word = freshWord({
      id,
      language: language!,
      lemma: lemma!,
      reading: reading!,
      meanings: [],
      forms: [],
    });
  }
  if (!word) return [];
  return (
    await candidates(word, await getSettings(), Date.now(), durationMs)
  ).schedules.map((card) => card.due);
}

export async function dailyCounts(settings: Settings, now = Date.now()) {
  const start = dayStart(
    studyDay(now, settings.rolloverHour),
    settings.rolloverHour,
  );
  const history = await db.reviews
    .where("time")
    .between(start, now, true, true)
    .filter(
      (review) =>
        review.active &&
        JSON.parse(review.wordId)[0] === settings.studyLanguage,
    )
    .toArray();
  return {
    today: history.length,
    introduced: new Set(
      history
        .filter((review) => !review.before?.card?.reps)
        .map((review) => review.wordId),
    ).size,
    reviews: history.filter(
      (review) =>
        review.before?.card?.state === 2 || review.before?.card?.interday,
    ).length,
  };
}

export async function reviewQueue() {
  const settings = await getSettings(),
    now = Date.now();
  const words = (
    await db.vocabulary
      .where("language")
      .equals(settings.studyLanguage)
      .toArray()
  ).filter((word) => word.card && !word.known && !word.suspended);
  const counts = await dailyCounts(settings, now);
  const available = Math.max(
    0,
    (settings.reviewLimit ?? Infinity) - counts.reviews,
  );
  const byDue = (a: Vocabulary, b: Vocabulary) =>
    a.card!.due - b.card!.due || a.id.localeCompare(b.id);
  const learning = words
    .filter(
      (word) =>
        (word.card!.state === 1 || word.card!.state === 3) &&
        !word.card!.interday &&
        word.card!.due <= now,
    )
    .sort(byDue);
  const interday = words
    .filter((word) => word.card!.interday && word.card!.due <= now)
    .sort(byDue);
  const reviews = words
    .filter((word) => word.card!.state === 2 && word.card!.due <= now)
    .sort(byDue);
  const due = [...learning, ...[...interday, ...reviews].slice(0, available)];
  const fresh =
    available > 0
      ? (
          await orderNewWords(
            words.filter((word) => word.card!.state === 0),
            settings,
          )
        ).slice(0, Math.max(0, settings.newLimit - counts.introduced))
      : [];
  const future = words
    .filter(
      (word) =>
        (word.card!.state === 1 || word.card!.state === 3) &&
        !word.card!.interday &&
        word.card!.due > now,
    )
    .sort(byDue);
  const ahead =
    due.length || fresh.length
      ? []
      : future.filter(
          (word) => word.card!.due <= now + settings.learnAheadMinutes * 60000,
        );
  const rollover = dayStart(
    studyDay(now, settings.rolloverHour) + 1,
    settings.rolloverHour,
  );
  const waiting = Math.min(
    rollover,
    ...future.map((word) =>
      Math.max(now + 500, word.card!.due - settings.learnAheadMinutes * 60000),
    ),
  );
  return {
    words: [...due, ...fresh, ...ahead],
    due: due.length,
    fresh: fresh.length,
    waiting: future.length ? waiting : null,
    wakeAt: waiting,
  };
}

export async function rescheduleExisting(after = "") {
  const settings = await getSettings();
  if (settings.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  const model = settings.algorithm === "rwkv" ? await loadModel() : undefined;
  const words = await db.vocabulary
    .where("id")
    .above(after)
    .filter(
      (word) =>
        word.language === settings.studyLanguage &&
        !word.known &&
        !word.suspended &&
        word.card?.state === 2 &&
        word.card.last_review !== null,
    )
    .limit(100)
    .toArray();
  for (const word of words) {
    const retention = await effectiveRetention(word, settings);
    const curve = model ? await db.rwkvCards.get(word.id) : undefined;
    if (model && !curve) throw new Error(t("rwkv_not_ready"));
    const interval = model
      ? model.interval(curve!.curve, retention)
      : word.card!.fsrs.stability *
        fsrs().calculate_interval_modifier(retention);
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
    await db.vocabulary
      .where("id")
      .equals(word.id)
      .modify((current) => {
        current.card = card;
        current.version++;
        current.srsVersion++;
        current.updated = Date.now();
      });
  }
  return {
    count: words.length,
    cursor: words.length === 100 ? words.at(-1)!.id : null,
  };
}
