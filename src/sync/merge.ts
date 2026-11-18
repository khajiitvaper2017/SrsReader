import Dexie from "dexie";
import { z } from "zod";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { audioInfoSchema } from "@/audio/model";
import {
  ankiReviewSchema,
  assetId,
  cardAssetSchema,
  cardSchema,
  noteSchema,
  noteTypeSchema,
} from "@/cards/model";
import { validateCardReferences } from "@/cards/validate";
import { sentenceSchema } from "@/examples/sentence-model";
import { deckSchema } from "@/srs/deck-model";
import { reviewSchema } from "@/srs/history";
import { scheduleSchema } from "@/srs/model";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { defaults, settingsSchema } from "@/settings/model";
import { saveSettings } from "@/settings/store";
import { vocabularySchema } from "@/vocabulary/model";
import { applyPortableSettings, portableSettings } from "./settings";
import {
  recordKey,
  snapshotSchema,
  type SyncIdentity,
  type SyncRecord,
  type SyncSnapshot,
} from "./model";
import { withoutSyncTracking } from "./tracking";
import { readMergeFrontier, writeMergeFrontier } from "./metadata";

const cardFields = {
  deckId: cardSchema.shape.deckId,
  suspended: cardSchema.shape.suspended,
  leech: cardSchema.shape.leech,
  retentionOverride: cardSchema.shape.retentionOverride,
};
const audioSchema = audioInfoSchema.extend({ blob: z.instanceof(Blob) });
const checkpointSchema = z.object({
  id: z.string(),
  schedule: scheduleSchema.nullable(),
  reviewId: z.string().optional(),
});
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const same = (a: unknown, b: unknown) => {
  const canonical = (_key: string, value: unknown): unknown => {
    if (value instanceof Blob) return { size: value.size, type: value.type };
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          compareText(left, right),
        ),
      );
    }
    return value;
  };
  return JSON.stringify(a, canonical) === JSON.stringify(b, canonical);
};
const invalid = () =>
  Object.assign(new Error("sync_invalid_data"), { code: "sync_invalid_data" });

function observes(a: SyncRecord, b: SyncRecord) {
  return a.device === b.device
    ? a.counter >= b.counter
    : (a.observed[b.device] ?? 0) >= b.counter;
}
function order(a: SyncRecord, b: SyncRecord) {
  return (
    Number(a.deleted) - Number(b.deleted) ||
    Number(a.kind === "reviews" && a.value?.active === false) -
      Number(b.kind === "reviews" && b.value?.active === false) ||
    a.time - b.time ||
    compareText(a.device, b.device) ||
    a.counter - b.counter
  );
}
function frontier(records: SyncRecord[]) {
  const unique = new Map<string, SyncRecord>();
  for (const record of records) {
    const dot = JSON.stringify([record.device, record.counter]);
    const previous = unique.get(dot);
    if (previous && !same(previous, record)) throw invalid();
    unique.set(dot, record);
  }
  const values = [...unique.values()];
  return values
    .filter(
      (record) =>
        !values.some((other) => other !== record && observes(other, record)),
    )
    .sort(order);
}
function restoreReview(value: Record<string, unknown>) {
  const before = value.before as Record<string, unknown> | null;
  return reviewSchema.parse({
    ...value,
    sequence: 0,
    afterVersion: 0,
    afterSrsVersion: 0,
    before: before ? { ...before, version: 0, srsVersion: 0 } : null,
  });
}
function validateRecord(record: SyncRecord) {
  if (
    record.key !== recordKey(record.kind, record.id) ||
    (record.observed[record.device] !== undefined &&
      record.observed[record.device]! >= record.counter)
  )
    throw invalid();
  if (record.deleted) {
    if (record.value !== null) throw invalid();
    return;
  }
  const value = record.value;
  if (!value || typeof value.id !== "string") throw invalid();
  if (record.kind === "settings") {
    if (
      record.id !== JSON.stringify(["main", value.field]) ||
      value.id !== "main" ||
      typeof value.field !== "string" ||
      !Object.hasOwn(value, "value") ||
      (value.field !== "theme" &&
        !Object.hasOwn(portableSettings(defaults), value.field))
    )
      throw invalid();
    settingsSchema.parse({ ...defaults, [value.field]: value.value });
    return;
  }
  if (record.kind === "cards" && typeof value.field === "string") {
    const id =
      typeof value.reviewId === "string"
        ? [value.id, value.field, value.reviewId]
        : [value.id, value.field];
    if (
      record.id !== JSON.stringify(id) ||
      !Object.hasOwn(cardFields, value.field)
    )
      throw invalid();
    cardFields[value.field as keyof typeof cardFields].parse(value.value);
    return;
  }
  if (record.id !== value.id) throw invalid();
  switch (record.kind) {
    case "cards":
      cardSchema.parse({
        ...value,
        schedule: null,
        version: 0,
        srsVersion: 0,
        updated: 0,
      });
      break;
    case "schedules":
      checkpointSchema.parse(value);
      break;
    case "reviews":
      restoreReview(value);
      break;
    case "vocabulary":
      vocabularySchema.parse({
        ...value,
        version: 0,
        updated: value.updated ?? 0,
      });
      break;
    case "notes":
      noteSchema.parse({ ...value, version: 0, updated: value.updated ?? 0 });
      break;
    case "noteTypes":
      noteTypeSchema.parse(value);
      break;
    case "ankiReviews":
      ankiReviewSchema.parse(value);
      break;
    case "decks":
      deckSchema.parse(value);
      break;
    case "sentences":
      sentenceSchema.parse(value);
      break;
    case "cardAssets": {
      const asset = cardAssetSchema.parse(value);
      if (asset.id !== assetId(asset.namespace, asset.name)) throw invalid();
      break;
    }
    case "audio":
      audioSchema.parse(value);
      break;
  }
}

export async function mergeSnapshots(
  snapshots: SyncSnapshot[],
  report: (done: number, total: number) => void,
): Promise<void> {
  let incoming: SyncSnapshot[];
  try {
    incoming = snapshots.map((snapshot) => snapshotSchema.parse(snapshot));
    for (const snapshot of incoming) {
      for (const record of snapshot.records) {
        if (
          record.device !== snapshot.device ||
          record.counter > snapshot.revision ||
          (snapshot.observed[record.device] ?? 0) < record.counter
        )
          throw invalid();
        validateRecord(record);
      }
      for (const record of snapshot.dependencies) {
        if (
          record.deleted ||
          (snapshot.observed[record.device] ?? 0) < record.counter
        )
          throw invalid();
        validateRecord(record);
      }
      for (const record of [...snapshot.records, ...snapshot.dependencies]) {
        if (
          Object.entries(record.observed).some(
            ([device, counter]) => counter > (snapshot.observed[device] ?? 0),
          )
        )
          throw invalid();
      }
    }
  } catch {
    throw invalid();
  }
  report(1, 5);
  await srsWrite(() =>
    db.transaction(
      "rw",
      [
        db.syncRecords,
        db.syncMeta,
        db.syncAuthored,
        db.syncDependencies,
        db.vocabulary,
        db.notes,
        db.noteTypes,
        db.cards,
        db.reviews,
        db.ankiReviews,
        db.decks,
        db.sentences,
        db.cardAssets,
        db.audio,
        db.settings,
        db.dictionaries,
        db.srsMeta,
        db.rwkvMeta,
        db.rwkvCards,
        db.rwkvEntities,
      ],
      async () =>
        withoutSyncTracking(async () => {
          const identity = (await db.syncMeta.get("identity")) as
            SyncIdentity | undefined;
          if (!identity)
            throw Object.assign(new Error("sync_not_initialized"), {
              code: "sync_not_initialized",
            });
          const previous = await db.syncRecords.toArray();
          const localDependencies = await db.syncDependencies.toArray();
          const { records: savedRecords, retained: retainedRecords } =
            await readMergeFrontier();
          const groups = new Map<string, SyncRecord[]>();
          const retainedGroups = new Map<string, SyncRecord[]>();
          for (const record of [
            ...retainedRecords,
            ...localDependencies,
            ...previous,
            ...savedRecords,
            ...incoming.flatMap((snapshot) => [
              ...snapshot.records,
              ...snapshot.dependencies,
            ]),
          ]) {
            validateRecord(record);
            if (!record.deleted) {
              const group = retainedGroups.get(record.key) ?? [];
              group.push(record);
              retainedGroups.set(record.key, group);
            }
          }
          const retainedFrontiers = [...retainedGroups.values()].flatMap(
            frontier,
          );
          const retained = new Map<string, SyncRecord>();
          for (const record of retainedFrontiers) {
            const old = retained.get(record.key);
            if (!old || order(record, old) > 0)
              retained.set(record.key, record);
          }
          for (const record of [
            ...previous,
            ...savedRecords,
            ...incoming.flatMap((snapshot) => snapshot.records),
          ]) {
            const group = groups.get(record.key) ?? [];
            group.push(record);
            groups.set(record.key, group);
          }
          const frontiers = [...groups.values()].flatMap(frontier);
          const winners = new Map<string, SyncRecord>();
          for (const record of frontiers) {
            const old = winners.get(record.key);
            if (!old || order(record, old) > 0) winners.set(record.key, record);
          }
          report(2, 5);
          const alive = (kind: SyncRecord["kind"]) =>
            [...winners.values()].filter(
              (record) => record.kind === kind && !record.deleted,
            );
          const recordsFor = (kind: SyncRecord["kind"]) =>
            new Map(alive(kind).map((record) => [record.id, record]));
          const notes = recordsFor("notes");
          const types = recordsFor("noteTypes");
          const words = recordsFor("vocabulary");
          const decks = recordsFor("decks");
          const assets = recordsFor("cardAssets");
          const cards = new Map(
            alive("cards")
              .filter((record) => !record.value?.field)
              .map((record) => [record.id, record]),
          );
          // A concurrent surviving card keeps its dependencies, not a dangling reference or cascade loss.
          const requireRecord = (
            target: Map<string, SyncRecord>,
            kind: SyncRecord["kind"],
            id: string,
          ) => {
            if (target.has(id)) return;
            const record = retained.get(recordKey(kind, id));
            if (!record) throw invalid();
            target.set(id, record);
          };
          for (const card of cards.values()) {
            requireRecord(notes, "notes", card.value!.noteId as string);
          }
          for (const note of notes.values()) {
            requireRecord(types, "noteTypes", note.value!.noteTypeId as string);
            if (
              note.value!.wordId &&
              !winners.get(
                recordKey("vocabulary", note.value!.wordId as string),
              )?.deleted
            ) {
              requireRecord(words, "vocabulary", note.value!.wordId as string);
            }
          }
          // Keep all media in a live namespace, including resources referenced indirectly by CSS/JS.
          const namespaces = new Set(
            [...notes.values()].map((record) => record.value!.mediaNamespace),
          );
          for (const record of retained.values()) {
            if (
              record.kind === "cardAssets" &&
              namespaces.has(record.value!.namespace) &&
              !assets.has(record.id)
            )
              assets.set(record.id, record);
          }
          const oldCards = new Map(
            (await db.cards.toArray()).map((card) => [card.id, card]),
          );
          const oldNotes = new Map(
            (await db.notes.toArray()).map((note) => [note.id, note]),
          );
          const oldWords = new Map(
            (await db.vocabulary.toArray()).map((word) => [word.id, word]),
          );
          const oldReviews = await db.reviews.toArray();
          const srsMeta = await db.srsMeta.get("main");
          const reviewRecords = recordsFor("reviews");
          const reviews = [...reviewRecords.values()]
            .map((record) => restoreReview(record.value!))
            .sort((a, b) => a.time - b.time || compareText(a.id, b.id));
          const oldReviewById = new Map(
            oldReviews.map((review) => [review.id, review]),
          );
          const previousReviewRecords = new Map(
            previous
              .filter((record) => record.kind === "reviews" && !record.deleted)
              .map((record) => [record.id, record]),
          );
          const normalizedOld = new Map(
            oldReviews.map((review) => [
              review.id,
              restoreReview(
                previousReviewRecords.get(review.id)?.value ?? review,
              ),
            ]),
          );
          const reviewById = new Map(
            reviews.map((review) => [review.id, review]),
          );
          const reviewBelongsToCard = (reviewId: string, cardId: string) => {
            const review = reviewById.get(reviewId);
            return review
              ? review.cardId === cardId
              : winners.get(recordKey("reviews", reviewId))?.deleted;
          };
          const changedHistoryCards = new Set<string>();
          for (const review of reviews) {
            if (!same(normalizedOld.get(review.id), review))
              changedHistoryCards.add(review.cardId);
          }
          for (const review of oldReviews) {
            if (!reviewById.has(review.id))
              changedHistoryCards.add(review.cardId);
          }
          const historyChanged = changedHistoryCards.size > 0;
          let sequence = oldReviews.reduce(
            (maximum, review) => Math.max(maximum, review.sequence),
            srsMeta?.sequence ?? 0,
          );
          const activeByCard = new Map<string, typeof reviews>();
          for (const review of reviews) {
            if (review.active) {
              const history = activeByCard.get(review.cardId) ?? [];
              history.push(review);
              activeByCard.set(review.cardId, history);
            }
            if (historyChanged) review.sequence = ++sequence;
            else Object.assign(review, oldReviewById.get(review.id));
            // A deleted card may retain immutable historical answers.
            if (
              !cards.has(review.cardId) &&
              !winners.get(recordKey("cards", review.cardId))?.deleted
            )
              throw invalid();
            if (
              review.before &&
              (review.before.id !== review.cardId ||
                review.before.language !== review.language)
            )
              throw invalid();
            if (
              cards.has(review.cardId) &&
              cards.get(review.cardId)!.value!.language !== review.language
            )
              throw invalid();
          }
          const checkpoints = recordsFor("schedules");
          const previousCheckpoints = new Map(
            previous
              .filter((record) => record.kind === "schedules")
              .map((record) => [record.id, record]),
          );
          for (const record of checkpoints.values()) {
            if (
              !cards.has(record.id) &&
              !winners.get(recordKey("cards", record.id))?.deleted
            )
              throw invalid();
            const checkpoint = checkpointSchema.parse(record.value);
            if (
              checkpoint.reviewId &&
              !reviewBelongsToCard(checkpoint.reviewId, record.id)
            )
              throw invalid();
          }
          const fieldRecords = alive("cards").filter(
            (record) => typeof record.value!.field === "string",
          );
          const editsByCard = new Map<string, Map<string, SyncRecord[]>>();
          for (const record of fieldRecords) {
            if (
              record.value!.reviewId &&
              !reviewBelongsToCard(
                record.value!.reviewId as string,
                record.value!.id as string,
              )
            )
              throw invalid();
            const cardId = record.value!.id as string;
            const field = record.value!.field as string;
            const byField =
              editsByCard.get(cardId) ?? new Map<string, SyncRecord[]>();
            const edits = byField.get(field) ?? [];
            edits.push(record);
            byField.set(field, edits);
            editsByCard.set(cardId, byField);
            if (
              !cards.has(cardId) &&
              !winners.get(recordKey("cards", cardId))?.deleted
            )
              throw invalid();
          }
          const projectFields = (record: SyncRecord, excluding?: string) => {
            const value = { ...record.value! };
            for (const [field, records] of editsByCard.get(record.id) ?? []) {
              const edits = frontier(
                records.filter(
                  (edit) =>
                    !observes(record, edit) &&
                    (!excluding || edit.value!.reviewId !== excluding) &&
                    (!edit.value!.reviewId ||
                      reviewById.get(edit.value!.reviewId as string)?.active),
                ),
              );
              const edit = edits.at(-1);
              if (edit) value[field] = edit.value!.value;
            }
            return value;
          };
          const projectSchedule = (id: string, excluding?: string) => {
            const answer = activeByCard
              .get(id)
              ?.findLast((review) => review.id !== excluding);
            let schedule = answer?.after ?? null;
            let reviewId = answer?.id;
            const checkpoint = checkpoints.get(id);
            if (checkpoint) {
              const parsed = checkpointSchema.parse(checkpoint.value);
              const source = parsed.reviewId
                ? reviewById.get(parsed.reviewId)
                : undefined;
              if (
                (!parsed.reviewId || source?.active) &&
                (!excluding || parsed.reviewId !== excluding)
              ) {
                const answerRecord = answer && reviewRecords.get(answer.id)!;
                if (
                  !answerRecord ||
                  observes(checkpoint, answerRecord) ||
                  (!observes(answerRecord, checkpoint) &&
                    (checkpoint.time > answer!.time ||
                      (checkpoint.time === answer!.time &&
                        compareText(checkpoint.id, answer!.id) > 0)))
                ) {
                  schedule = parsed.schedule;
                  reviewId = parsed.reviewId;
                }
              }
            }
            return { schedule, reviewId };
          };
          const mergedCards = [...cards.values()].map((record) => {
            const value = projectFields(record);
            if (
              value.deckId &&
              winners.get(recordKey("decks", value.deckId as string))?.deleted
            )
              value.deckId = null;
            if (value.deckId)
              requireRecord(decks, "decks", value.deckId as string);
            const { schedule, reviewId } = projectSchedule(record.id);
            const answer = reviewId ? reviewById.get(reviewId) : undefined;
            const checkpoint = checkpoints.get(record.id);
            const old = oldCards.get(record.id);
            const oldCheckpoint = previousCheckpoints.get(record.id);
            const checkpointChanged =
              checkpoint?.device !== oldCheckpoint?.device ||
              checkpoint?.counter !== oldCheckpoint?.counter;
            const semantic = cardSchema.parse({
              ...value,
              schedule,
              version: 0,
              srsVersion: 0,
              updated: 0,
            });
            const changed =
              checkpointChanged ||
              changedHistoryCards.has(record.id) ||
              !old ||
              !same(
                { ...old, version: 0, srsVersion: 0, updated: 0 },
                semantic,
              );
            const schedulingChanged =
              checkpointChanged ||
              changedHistoryCards.has(record.id) ||
              !old ||
              !same(old.schedule, schedule) ||
              old.suspended !== semantic.suspended ||
              old.leech !== semantic.leech ||
              old.retentionOverride !== semantic.retentionOverride;
            const card = {
              ...semantic,
              version: (old?.version ?? 0) + Number(changed),
              srsVersion: (old?.srsVersion ?? 0) + Number(schedulingChanged),
              updated: changed
                ? Math.max(
                    record.time,
                    old?.updated ?? 0,
                    answer?.time ?? 0,
                    checkpoint?.time ?? 0,
                  )
                : old!.updated,
            };
            const oldAnswer = answer && oldReviewById.get(answer.id);
            if (
              answer &&
              same(schedule, answer.after) &&
              (!oldAnswer ||
                oldAnswer.afterSrsVersion === old?.srsVersion ||
                (changedHistoryCards.has(record.id) &&
                  !same(old?.schedule, schedule)))
            ) {
              const beforeFields = projectFields(record, answer.id);
              answer.before = {
                id: card.id,
                language: card.language,
                version: Math.max(0, card.version - 1),
                srsVersion: Math.max(0, card.srsVersion - 1),
                schedule: projectSchedule(record.id, answer.id).schedule,
                suspended: beforeFields.suspended as boolean,
                leech: beforeFields.leech as boolean,
              };
              answer.afterVersion = card.version;
              answer.afterSrsVersion = card.srsVersion;
              // Undo projects merged history, never the review author's obsolete rollback snapshot.
              answer.fsrsLog = null;
            }
            return card;
          });
          report(3, 5);
          const mergedNotes = [...notes.values()].map((record) => {
            const note = noteSchema.parse({
              ...record.value!,
              version: 0,
              updated: record.value!.updated ?? record.time,
            });
            if (
              note.wordId &&
              winners.get(recordKey("vocabulary", note.wordId))?.deleted
            )
              delete note.wordId;
            const old = oldNotes.get(note.id);
            note.version =
              (old?.version ?? 0) +
              Number(!old || !same({ ...old, version: 0 }, note));
            return note;
          });
          const mergedWords = [...words.values()].map((record) => {
            const word = vocabularySchema.parse({
              ...record.value!,
              version: 0,
              updated: record.value!.updated ?? record.time,
            });
            if (word.readingCardId && !cards.has(word.readingCardId))
              delete word.readingCardId;
            const old = oldWords.get(word.id);
            word.version =
              (old?.version ?? 0) +
              Number(!old || !same({ ...old, version: 0 }, word));
            return word;
          });
          const mergedTypes = [...types.values()].map((record) =>
            noteTypeSchema.parse(record.value),
          );
          const mergedDecks = [...decks.values()].map((record) =>
            deckSchema.parse(record.value),
          );
          try {
            validateCardReferences(
              mergedTypes,
              mergedNotes,
              mergedCards,
              mergedDecks,
              mergedWords,
            );
          } catch {
            throw invalid();
          }
          const mergedAssets = [...assets.values()].map((record) =>
            cardAssetSchema.parse(record.value),
          );
          const ankiReviews = alive("ankiReviews").map((record) =>
            ankiReviewSchema.parse(record.value),
          );
          for (const review of ankiReviews)
            if (
              !cards.has(review.cardId) &&
              !winners.get(recordKey("cards", review.cardId))?.deleted
            )
              throw invalid();
          const sentences = alive("sentences").map((record) =>
            sentenceSchema.parse(record.value),
          );
          for (const sentence of sentences) {
            if (
              sentence.tokens.some(
                (token) =>
                  token.end <= token.start ||
                  token.end > sentence.sentence.length,
              )
            )
              throw invalid();
          }
          const audio = alive("audio").map((record) =>
            audioSchema.parse(record.value),
          );
          const currentSettings = settingsSchema.parse(
            (await db.settings.get("main"))?.value ?? defaults,
          );
          const portable = Object.fromEntries(
            alive("settings").map((record) => [
              record.value!.field as string,
              record.value!.value,
            ]),
          );
          const settings = await Dexie.waitFor(
            applyPortableSettings(currentSettings, portable),
          );
          const invalidate =
            historyChanged ||
            currentSettings.rolloverHour !== settings.rolloverHour ||
            mergedCards.some(
              (card) => !same(oldCards.get(card.id)?.schedule, card.schedule),
            ) ||
            oldCards.size !== mergedCards.length;
          const observed = { ...identity.observed };
          for (const snapshot of incoming) {
            for (const [device, counter] of Object.entries(snapshot.observed))
              observed[device] = Math.max(observed[device] ?? 0, counter);
            observed[snapshot.device] = Math.max(
              observed[snapshot.device] ?? 0,
              snapshot.revision,
            );
          }
          // Every schema/reference check above completes before the first database mutation.
          report(4, 5);
          await db.cards.clear();
          await db.cards.bulkPut(mergedCards);
          await db.notes.clear();
          await db.notes.bulkPut(mergedNotes);
          await db.noteTypes.clear();
          await db.noteTypes.bulkPut(mergedTypes);
          await db.vocabulary.clear();
          await db.vocabulary.bulkPut(mergedWords);
          await db.decks.clear();
          await db.decks.bulkPut(mergedDecks);
          await db.cardAssets.clear();
          await db.cardAssets.bulkPut(mergedAssets);
          await db.reviews.clear();
          await db.reviews.bulkPut(reviews);
          await db.ankiReviews.clear();
          await db.ankiReviews.bulkPut(ankiReviews);
          await db.sentences.clear();
          await db.sentences.bulkPut(sentences);
          await db.audio.clear();
          await db.audio.bulkPut(audio);
          await saveSettings(settings);
          for (const [id, preference] of Object.entries(
            settings.dictionaryPreferences,
          )) {
            await db.dictionaries.update(id, {
              enabled: preference.enabled,
              order: preference.order,
            });
          }
          if (invalidate) await invalidateRwkv();
          await db.srsMeta.put({
            ...srsMeta,
            id: "main",
            sequence,
            undo: historyChanged || invalidate ? undefined : srsMeta?.undo,
          });
          await db.syncRecords.clear();
          await db.syncRecords.bulkPut([...winners.values()]);
          await writeMergeFrontier(frontiers, retainedFrontiers);
          await db.syncMeta.put({ ...identity, observed });
        }),
    ),
  ).catch((error: unknown) => {
    if (error instanceof z.ZodError) throw invalid();
    throw error;
  });
  report(5, 5);
}
