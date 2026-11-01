import { db } from "@/platform/database/db";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import type { Card } from "@/cards/model";
import { emptySchedule } from "@/srs/model";
import { fsrsAnswers } from "@/srs/engines/fsrs";
import { cacheKey } from "@/srs/engines/rwkv/cache";
import { buildFeatures, emptyFeatures } from "@/srs/engines/rwkv/features";
import {
  entityKey,
  type EntityStates,
  type RwkvModel,
} from "@/srs/engines/rwkv/model";
import { pack, unpack } from "@/srs/engines/rwkv/precision";
import type { RwkvCard } from "@/srs/engines/rwkv/records";
import {
  invalidateRwkv,
  loadCard,
  loadEntities,
} from "@/srs/engines/rwkv/storage";
import { rwkvInterval } from "@/srs/engines/rwkv/interval";
import { reviewIntervals } from "@/srs/intervals";
import { effectiveRetention } from "@/srs/retention";
import { studyDay } from "@/srs/study-day";
import { scheduleAnswers } from "@/srs/transitions";
import { reviewCards } from "@/vocabulary/storage";

export type HistoricalAnswer = {
  id: string;
  cardId: string;
  language: string;
  time: number;
  rating: 1 | 2 | 3 | 4;
  durationMs: number | null;
};

// The import host holds the SRS lock and keeps its publish transaction alive.
export async function replayHistoricalAnswers(
  events: HistoricalAnswer[],
  cardIds: string[],
  report?: (done: number, total: number) => void,
  model?: RwkvModel,
) {
  if (!cardIds.length || !events.length) return;
  const settings = await getSettings();
  const targets = new Set(cardIds);
  const cards = (await db.cards.bulkGet([...targets])).filter(
    (card): card is Card => !!card,
  );
  if (cards.length !== targets.size) throw new Error(t("card_not_found"));
  const projected = await reviewCards(cards);
  const retentions = new Map(
    await Promise.all(
      projected.map(
        async (word) =>
          [word.id, await effectiveRetention(word, settings)] as const,
      ),
    ),
  );
  const projectedById = new Map(projected.map((word) => [word.id, word]));
  const history = await db.reviews.toArray();
  const previousCount = history.length;
  const existing = new Set(history.map((review) => review.id));
  const scheduler =
    settings.algorithm === "fsrs" ? "ts-fsrs@5.4.2/FSRS-6" : "rwkv-sm56-w8-s8";
  for (const event of events) {
    if (existing.has(event.id)) continue;
    if (!targets.has(event.cardId)) throw new Error(t("card_not_found"));
    const word = projectedById.get(event.cardId)!;
    history.push({
      ...event,
      wordId: word.wordId,
      source: "review",
      before: null,
      afterVersion: 0,
      afterSrsVersion: 0,
      after: null,
      log: {},
      scheduler,
      retention: retentions.get(event.cardId)!,
      sequence: 0,
      active: true,
    });
    existing.add(event.id);
  }
  if (history.length === previousCount) return;
  history.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  const working = new Map(
    cards.map((card) => [card.id, { ...card, schedule: null } as Card]),
  );
  const touched = new Set<string>();
  const meta = await db.srsMeta.get("main");
  await invalidateRwkv();
  let global = emptyFeatures();
  for (const [index, review] of history.entries()) {
    if (index > 0 && index % 500 === 0) {
      report?.(index, history.length);
    }
    review.sequence = index + 1;
    if (!review.active) continue;
    let neural:
      | {
          card: RwkvCard;
          entities: Awaited<ReturnType<typeof loadEntities>>;
        }
      | undefined;
    if (model) {
      const previous = await loadCard(review.cardId);
      const row = buildFeatures(
        {
          wordId: review.cardId,
          language: review.language,
          time: review.time,
          day: studyDay(review.time, settings.rolloverHour),
          rating: review.rating,
          durationMs: review.durationMs,
        },
        previous?.features,
        global,
      );
      const keys = row.ids.map((id, stream) => entityKey(stream, id));
      const entities = (await loadEntities(keys)).filter(
        (entity) => entity !== undefined,
      );
      const states: EntityStates = new Map(
        entities.map((entity) => [entity.id, unpack(entity.state)]),
      );
      const result = model.step(row.features, row.ids, states);
      const updated = row.ids.map((id, stream) => ({
        id: entityKey(stream, id),
        state: pack(
          result.states.get(entityKey(stream, id))!,
          stream === 0 || stream === 2,
        ),
      }));
      const card = {
        id: review.cardId,
        features: row.card,
        curve: { w: result.heads.w, s: result.heads.s, d: result.heads.d },
      };
      await db.rwkvEntities.bulkPut(updated);
      await db.rwkvCards.put(card);
      global = row.global;
      neural = { card, entities: updated };
    }
    const card = working.get(review.cardId);
    if (!card) continue;
    const before = {
      id: card.id,
      language: card.language,
      version: card.version,
      srsVersion: card.srsVersion,
      schedule: card.schedule,
      suspended: card.suspended,
      leech: card.leech,
    };
    const schedule = card.schedule || emptySchedule(review.time);
    const retention = retentions.get(card.id)!;
    const answers = fsrsAnswers(schedule, review.time, retention, settings);
    const raw = answers.map((answer) => answer.interval);
    if (model && neural)
      raw[review.rating - 1] = rwkvInterval(
        model,
        {
          card: neural.card,
          entities: neural.entities.filter((entity) => entity !== undefined),
          meta: {
            id: "main",
            key: cacheKey(settings),
            cursor: review.sequence,
            features: global,
          },
        },
        card.language,
        retention,
        settings,
        review.time,
      );
    const intervals = reviewIntervals(
      raw,
      settings,
      `${card.id}:${schedule.reps}`,
      schedule.state === 2 ||
        (schedule.state === 3
          ? settings.relearningSteps
          : settings.learningSteps
        ).length === 0,
    );
    card.schedule = scheduleAnswers(
      schedule,
      answers.map((answer) => answer.memory),
      intervals,
      review.time,
      settings,
    )[review.rating - 1]!;
    card.srsVersion++;
    card.version++;
    card.updated = Date.now();
    review.before = before;
    review.after = card.schedule;
    review.afterSrsVersion = card.srsVersion;
    review.afterVersion = card.version;
    touched.add(card.id);
  }
  await db.reviews.clear();
  for (let offset = 0; offset < history.length; offset += 500)
    await db.reviews.bulkPut(history.slice(offset, offset + 500));
  await db.cards.bulkPut(
    [...working.values()].filter((card) => touched.has(card.id)),
  );
  await db.srsMeta.put({
    ...meta,
    id: "main",
    sequence: history.length,
    undo: undefined,
  });
  if (model)
    await db.rwkvMeta.put({
      id: "main",
      key: cacheKey(settings),
      cursor: history.length,
      features: global,
    });
  report?.(history.length, history.length);
}
