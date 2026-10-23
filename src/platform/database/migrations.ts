import { entryMatch, type Entry } from "@/dictionaries/model";
import { settingsSchema } from "@/settings/model";
import { reviewSchema } from "@/srs/history";
import { vocabularySchema } from "@/vocabulary/model";
import Dexie from "dexie";
import { mergeSentence, sentenceFromContext } from "@/examples/sentence-model";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";

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
}
