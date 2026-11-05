import { entryMatch, type Entry } from "@/dictionaries/model";
import { settingsSchema, type Settings } from "@/settings/model";
import type { Deck } from "@/srs/deck-model";
import { reviewSchema } from "@/srs/history";
import { vocabularySchema } from "@/vocabulary/model";
import Dexie, { type Transaction } from "dexie";
import { mergeSentence, sentenceFromContext } from "@/examples/sentence-model";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import {
  readerNote,
  readerLayoutCss,
  escapeHtml,
  type CustomField,
} from "@/cards/defaults";
import { prepareDictionarySnapshot } from "@/cards/snapshot";
import { assetId, type Card } from "@/cards/model";
import { scheduleSchema, type Schedule } from "@/srs/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";

const retiredDictionaryPrefix = '["immersion",';

export function removeRetiredDictionaryPreferences(
  settings: Partial<
    Pick<
      Settings,
      "dictionaryPreferences" | "frequencyPreferences" | "rankSources"
    >
  >,
) {
  for (const preferences of [
    settings.dictionaryPreferences,
    settings.frequencyPreferences,
    settings.rankSources,
  ]) {
    if (!preferences) continue;
    for (const id of Object.keys(preferences))
      if (id.startsWith(retiredDictionaryPrefix)) delete preferences[id];
  }
}

export function detachRetiredDictionary(deck: Deck) {
  if (!deck.dictionaryId?.startsWith(retiredDictionaryPrefix)) return false;
  delete deck.dictionaryId;
  delete deck.limit;
}

export function installMigrations(database: Dexie) {
  database.version(1).stores({
    dictionaries: "id, revisionId, order",
    entries: "id, revisionId, [revisionId+key], [revisionId+folded]",
    tags: "id, revisionId",
    dictionaryMedia: "id, revisionId",
    archives: "id",
    phrases: "id, revisionId, [revisionId+first]",
    vocabulary: "id, language, lemma, updated",
    reviews: "id, wordId, time, [wordId+time]",
    audio: "id",
    settings: "id",
  });
  database.version(2).stores({
    frequencies: "id, revisionId, [revisionId+folded]",
  });
  database.version(3).stores({ exampleCorpora: "language" });
  database.version(4).stores({ morphology: "language" });
  database.version(5).stores({ nechybujte: "term" });
  database
    .version(6)
    .stores({
      reviews: "id, wordId, time, [wordId+time], &sequence",
      srsMeta: "id",
      rwkvMeta: "id",
      rwkvEntities: "id",
      rwkvCards: "id",
    })
    .upgrade(async (tx) => {
      await tx
        .table("vocabulary")
        .toCollection()
        .modify((word) => {
          word.srsVersion = word.version;
          Object.assign(
            word,
            vocabularySchema.parse({ ...word, srsVersion: word.version }),
          );
        });
      let sequence = 0;
      await tx
        .table("reviews")
        .orderBy("time")
        .modify((review) => {
          Object.assign(
            review,
            reviewSchema.parse({
              ...review,
              cardId: review.wordId,
              language: JSON.parse(review.wordId)[0],
              before: review.before
                ? { ...review.before, schedule: review.before.card }
                : null,
              sequence: ++sequence,
              afterSrsVersion: review.afterVersion,
            }),
          );
        });
      await tx.table("srsMeta").put({ id: "main", sequence });
      const settings = await tx.table("settings").get("main");
      if (settings)
        await tx.table("settings").put({
          id: "main",
          value: settingsSchema.parse({
            retention: 0.9,
            onlyAgainGood: true,
            ...settings.value,
          }),
        });
    });
  database.version(7).stores({ analyses: "key" });
  database
    .version(8)
    .stores({
      entryMatches: "id, revisionId, [revisionId+folded]",
    })
    .upgrade(async (tx) => {
      const started = performance.now();
      const entries = tx.table<Entry, string>("entries");
      const total = await entries.count();
      console.info("[SrsReader] Dictionary match index building", { total });
      let lastKey: string | undefined;
      let count = 0;
      for (;;) {
        const batch = await (
          lastKey === undefined
            ? entries.toCollection()
            : entries.where(":id").above(lastKey)
        )
          .limit(500)
          .toArray();
        if (!batch.length) break;
        await tx.table("entryMatches").bulkAdd(batch.map(entryMatch));
        count += batch.length;
        if (count % 50000 === 0)
          console.info("[SrsReader] Dictionary match index building", {
            done: count,
            total,
          });
        lastKey = batch[batch.length - 1]!.id;
      }
      console.info("[SrsReader] Dictionary match index created", {
        entries: count,
        elapsedMs: Math.round(performance.now() - started),
      });
    });
  database
    .version(9)
    .stores({
      sentences: "id, language, *wordIds",
      decks: "id, language",
      frequencies: "id, revisionId, [revisionId+folded], [revisionId+rank]",
    })
    .upgrade(async (tx) => {
      async function moveContexts(
        word: Vocabulary & { contexts?: ReadingContext[] },
      ) {
        for (const context of word.contexts || []) {
          const sentence = sentenceFromContext(word.language, context, word.id);
          await tx
            .table("sentences")
            .put(
              mergeSentence(
                await tx.table("sentences").get(sentence.id),
                sentence,
              ),
            );
        }
        delete word.contexts;
      }
      for (const word of await tx.table("vocabulary").toArray()) {
        await moveContexts(word);
        await tx.table("vocabulary").put(word);
      }
      for (const review of await tx.table("reviews").toArray()) {
        if (!review.before) continue;
        await moveContexts(review.before);
        await tx.table("reviews").put(review);
      }
    });
  database
    .version(10)
    .stores({})
    .upgrade(async (tx) => {
      const record = await tx.table("settings").get("main");
      if (!record) return;
      const settings = settingsSchema.parse(record.value);
      for (const dictionary of await tx.table("dictionaries").toArray()) {
        if (dictionary.frequencyCount > 0)
          settings.frequencyPreferences[dictionary.id] = {
            enabled: dictionary.enabled,
            order: dictionary.order,
          };
      }
      const { studyLanguage: _language, ...value } = settings;
      await tx.table("settings").put({ id: "main", value });
    });
  database.version(11).stores({
    immersionWords: "id, dictionaryId, [dictionaryId+score]",
    immersionPassages: "id, dictionaryId",
  });
  database.version(12).stores({ spanishdict: "term" });
  database.version(13).stores({ importTasks: "id" });
  database.version(14).stores({
    entries: "id, revisionId, [revisionId+folded]",
    entryMatches: "id, [revisionId+folded]",
  });
  database.version(15).stores({ cardMedia: "id, wordId" });
  database
    .version(16)
    .stores({
      noteTypes: "id, sourceId",
      notes: "id, noteTypeId, wordId, mediaNamespace, sourceId, language",
      cards: "id, noteId, deckId, language, sourceId",
      cardAssets: "id, namespace, [namespace+name]",
      ankiReviews: "id, cardId, sourceId",
      vocabulary: "id, language, lemma, updated, readingCardId",
      reviews: "id, cardId, wordId, language, time, [cardId+time], &sequence",
    })
    .upgrade((tx) => migrateCards(tx, true));
  database.version(17).stores({ cardMedia: null });
  database
    .version(18)
    .stores({ importFiles: "id" })
    .upgrade(async (tx) => {
      const task = await tx.table("importTasks").get("current");
      if (task?.blob) {
        await tx.table("importFiles").put({ id: "current", blob: task.blob });
        delete task.blob;
        await tx.table("importTasks").put(task);
      }
    });
  database
    .version(19)
    .stores({})
    .upgrade((tx) => migrateCards(tx, false));
  database
    .version(20)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table("noteTypes")
        .where("id")
        .startsWith("reader:")
        .modify((type) => {
          for (const template of type.templates)
            template.back = template.back.replaceAll(
              "{{#Examples}}<section>{{Examples}}</section>{{/Examples}}",
              "",
            );
        });
    });
  database
    .version(21)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table("noteTypes")
        .where("id")
        .startsWith("reader:")
        .modify((type) => {
          if (!type.css.includes(readerLayoutCss)) type.css += readerLayoutCss;
        });
    });
  database
    .version(22)
    .stores({ immersionWords: null, immersionPassages: null })
    .upgrade(async (tx) => {
      await tx
        .table("dictionaries")
        .where("id")
        .startsWith(retiredDictionaryPrefix)
        .delete();
      await tx.table("decks").toCollection().modify(detachRetiredDictionary);
      const settings = await tx.table("settings").get("main");
      if (settings) {
        removeRetiredDictionaryPreferences(settings.value);
        await tx.table("settings").put(settings);
      }
    });
  database
    .version(23)
    .stores({
      reviews:
        "id, cardId, wordId, language, time, [cardId+time], [time+sequence], &sequence",
    })
    .upgrade(async (tx) => {
      await tx
        .table("cards")
        .toCollection()
        .modify((card) => {
          if (card.schedule)
            card.schedule = scheduleSchema.parse(card.schedule);
          card.srsVersion++;
          card.version++;
        });
      await tx.table("srsMeta").update("main", {
        undo: undefined,
        scheduledModel: undefined,
        reschedule: undefined,
      });
    });
  database.version(24).stores({
    syncRecords: "key, kind, device, counter",
    syncAuthored: "key, kind, counter",
    syncDependencies: "[device+counter], key",
    syncMeta: "id",
  });
}

async function migrateCards(tx: Transaction, hasLegacyMedia: boolean) {
  const decks = await tx.table("decks").toArray();
  const nativeLanguage = settingsSchema.parse(
    (await tx.table("settings").get("main"))?.value ?? {},
  ).nativeLanguages[0];
  for (const raw of await tx.table("vocabulary").toArray()) {
    if (!Object.hasOwn(raw, "card")) continue;
    const old = raw as Vocabulary & {
      card: Schedule | null;
      customFields?: CustomField[];
      suspended: boolean;
      leech: boolean;
      retentionOverride: number | null;
      srsVersion: number;
    };
    const prepared = readerNote(
      old,
      undefined,
      old.customFields,
      nativeLanguage,
    );
    const snapshot = await prepareDictionarySnapshot(
      { ...old, meanings: applyDefinitionOverrides(old.meanings, old) },
      {
        namespace: old.id,
        allowMissingMedia: true,
      },
    );
    prepared.note.fields[2] = snapshot.html;
    const contexts = await tx
      .table("sentences")
      .where("wordIds")
      .equals(old.id)
      .toArray();
    const sentence = contexts[0];
    if (sentence) {
      prepared.note.fields[3] = escapeHtml(sentence.sentence);
      prepared.note.fields[5] = escapeHtml(
        (nativeLanguage
          ? sentence.customTranslations?.[nativeLanguage]
          : undefined) ??
          sentence.translation?.text ??
          "",
      );
      prepared.note.fields[9] = contexts
        .slice(1)
        .map((entry) => `<p>${escapeHtml(entry.sentence)}</p>`)
        .join("");
    }
    for (const media of hasLegacyMedia
      ? await tx.table("cardMedia").where("wordId").equals(old.id).toArray()
      : []) {
      const name = `saved-${media.kind}-${encodeURIComponent(media.sentence)}-${media.name}`;
      await tx.table("cardAssets").put({
        id: assetId(old.id, name),
        namespace: old.id,
        name,
        mime: media.mime,
        blob: media.blob,
      });
      if (media.kind === "background")
        prepared.note.fields[8] = media.mime.startsWith("video/")
          ? `<video autoplay loop muted playsinline src="${escapeHtml(name)}"></video>`
          : `<img src="${escapeHtml(name)}">`;
      else if (media.kind === "wordAudio")
        prepared.note.fields[6] = `[sound:${name}]`;
      else if (media.sentence === sentence?.sentence)
        prepared.note.fields[7] = `[sound:${name}]`;
      else
        prepared.note.fields[9] += `<p>${escapeHtml(media.sentence)} [sound:${name}]</p>`;
    }
    const card: Card = {
      id: old.id,
      noteId: prepared.note.id,
      templateOrdinal: 0,
      deckId: old.mined
        ? null
        : (decks.find((deck) => deck.wordIds?.includes(old.id))?.id ?? null),
      language: old.language,
      schedule: old.card ? scheduleSchema.parse(old.card) : null,
      suspended: old.suspended,
      leech: old.leech ?? false,
      retentionOverride: old.retentionOverride ?? null,
      srsVersion: old.srsVersion ?? 0,
      version: old.version,
      created: old.created,
      updated: old.updated,
    };
    await tx.table("noteTypes").put(prepared.noteType);
    await tx.table("notes").put(prepared.note);
    await tx.table("cards").put(card);
    if (snapshot.assets.length)
      await tx.table("cardAssets").bulkPut(snapshot.assets);
    const {
      card: _schedule,
      customFields: _fields,
      suspended: _suspended,
      leech: _leech,
      retentionOverride: _retention,
      srsVersion: _srsVersion,
      ...lexeme
    } = old;
    await tx.table("vocabulary").put({ ...lexeme, readingCardId: card.id });
  }
  await tx
    .table("decks")
    .toCollection()
    .modify((deck) => {
      delete deck.wordIds;
    });
  await tx
    .table("reviews")
    .toCollection()
    .modify((review) => {
      review.cardId ??= review.wordId;
      review.language ??=
        review.before?.language ?? JSON.parse(review.wordId)[0];
      if (review.before) {
        if (!("schedule" in review.before))
          review.before.schedule = review.before.card;
        delete review.before.card;
        delete review.before.known;
      }
    });
}
