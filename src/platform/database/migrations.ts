import { settingsSchema } from "@/settings/model";
import { reviewSchema } from "@/srs/history";
import { vocabularySchema } from "@/vocabulary/model";
import Dexie from "dexie";

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
}
