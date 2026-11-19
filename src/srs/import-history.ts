import { db } from "@/platform/database/db";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import type { Card } from "@/cards/model";
import { emptySchedule } from "@/srs/model";
import { scheduleAnswers, fsrsScheduler } from "@/srs/scheduler";
import { cacheKey } from "@/srs/engines/rwkv/cache";
import { emptyFeatures } from "@/srs/engines/rwkv/features";
import {
  entityKey,
  type EntityStates,
  type RwkvModel,
} from "@/srs/engines/rwkv/model";
import { unpack } from "@/srs/engines/rwkv/precision";
import { simulateAnswers } from "@/srs/engines/rwkv/simulate";
import {
  invalidateRwkv,
  loadCard,
  loadEntities,
} from "@/srs/engines/rwkv/storage";
import { rwkvInterval } from "@/srs/engines/rwkv/interval";
import { effectiveRetention } from "@/srs/retention";
import { reviewCards } from "@/vocabulary/storage";
import { deckPreferences } from "@/srs/preferences";
import { deckReviewSettingsForCards } from "@/srs/decks";

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
  const decks = await deckReviewSettingsForCards(cards);
  const preferences = new Map(
    projected.map((word) => [
      word.id,
      deckPreferences(settings, decks.get(word.document.card.deckId ?? "")),
    ]),
  );
  const retentions = new Map(
    await Promise.all(
      projected.map(
        async (word) =>
          [
            word.id,
            await effectiveRetention(word, preferences.get(word.id)!),
          ] as const,
      ),
    ),
  );
  const projectedById = new Map(projected.map((word) => [word.id, word]));
  const history = await db.reviews.toArray();
  const previousCount = history.length;
  const existing = new Set(history.map((review) => review.id));
  const appended = new Set<string>();
  const meta = await db.srsMeta.get("main");
  let sequence = meta?.sequence ?? 0;
  const scheduler =
    settings.algorithm === "fsrs"
      ? fsrsScheduler(settings.fsrsVersion)
      : "rwkv-sm56-w8-s8";
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
      fsrsLog: null,
      log: {},
      scheduler,
      retention: retentions.get(event.cardId)!,
      sequence: ++sequence,
      active: true,
    });
    existing.add(event.id);
    appended.add(event.id);
  }
  if (history.length === previousCount) return;
  history.sort((a, b) => a.time - b.time || a.sequence - b.sequence);
  const working = new Map(
    cards.map((card) => [card.id, { ...card, schedule: null } as Card]),
  );
  const touched = new Set<string>();
  await invalidateRwkv();
  let global = emptyFeatures();
  for (const [index, review] of history.entries()) {
    if (index > 0 && index % 500 === 0) {
      report?.(index, history.length);
    }
    if (!review.active) continue;
    let neural: ReturnType<typeof simulateAnswers> | undefined;
    if (model) {
      const previous = await loadCard(review.cardId);
      const ids = [
        review.cardId,
        review.language,
        review.cardId,
        "main",
        "main",
      ];
      const keys = ids.map((id, stream) => entityKey(stream, id));
      const entities = (await loadEntities(keys)).filter(
        (entity) => entity !== undefined,
      );
      const states: EntityStates = new Map(
        entities.map((entity) => [entity.id, unpack(entity.state)]),
      );
      neural = simulateAnswers(
        {
          model,
          meta: {
            id: "main",
            key: cacheKey(settings),
            cursor: index,
            features: global,
          },
          card: previous,
          ids,
          entities,
          states,
        },
        review.cardId,
        review.language,
        review.time,
        review.durationMs,
        settings,
      );
      const answer = neural.answers[review.rating - 1]!;
      await db.rwkvEntities.bulkPut(answer.entities);
      await db.rwkvCards.put(answer.card);
      global = answer.meta.features;
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
    const options = preferences.get(card.id)!;
    const answers = scheduleAnswers(
      card.id,
      schedule,
      review.time,
      retention,
      options,
      neural?.answers.map((answer) =>
        rwkvInterval(neural.model, answer, card.language, retention, options),
      ),
    );
    const answer = answers[review.rating - 1]!;
    card.schedule = answer.schedule;

    card.srsVersion++;
    card.version++;
    card.updated = Date.now();
    if (appended.has(review.id)) {
      review.before = before;
      review.after = card.schedule;
      review.afterSrsVersion = card.srsVersion;
      review.afterVersion = card.version;
      review.fsrsLog = answer.revlog;
    }
    touched.add(card.id);
  }
  const added = history.filter((review) => appended.has(review.id));
  for (let offset = 0; offset < added.length; offset += 500)
    await db.reviews.bulkAdd(added.slice(offset, offset + 500));
  await db.cards.bulkPut(
    [...working.values()].filter((card) => touched.has(card.id)),
  );
  await db.srsMeta.put({
    ...meta,
    id: "main",
    sequence,
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
