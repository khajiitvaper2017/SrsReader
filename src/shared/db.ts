import { settingsSchema } from "@/settings/model";
import { reviewSchema } from "@/srs/history";
import type { FeatureCard, FeatureGlobal } from "@/srs/rwkv/features";
import type { Heads } from "@/srs/rwkv/model";
import type { StoredLayers } from "@/srs/rwkv/precision";
import { vocabularySchema } from "@/vocabulary/model";
import Dexie, { type Table } from "dexie";

export type RwkvEntity = { id: string; state: StoredLayers };
export type RwkvCard = {
  id: string;
  features: FeatureCard;
  curve: Pick<Heads, "w" | "s" | "d">;
};
export type RwkvMeta = {
  id: string;
  key: string;
  cursor: number;
  features: FeatureGlobal;
};
export type SrsMeta = {
  id: string;
  sequence: number;
  undo?: {
    reviewId: string;
    entities: RwkvEntity[];
    card?: RwkvCard;
    meta: RwkvMeta;
  };
};

import type { AudioRecord } from "@/audio/model";
import type {
  Dictionary,
  DictionaryMedia,
  Entry,
  Frequency,
  LookupResult,
  Phrase,
  Tag,
} from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import type { Review } from "@/srs/history";
import type { Vocabulary } from "@/vocabulary/model";

class ReaderDatabase extends Dexie {
  srsMeta!: Table<SrsMeta, string>;
  rwkvMeta!: Table<RwkvMeta, string>;
  rwkvEntities!: Table<RwkvEntity, string>;
  rwkvCards!: Table<RwkvCard, string>;
  dictionaries!: Table<Dictionary, string>;
  entries!: Table<Entry, string>;
  frequencies!: Table<Frequency, string>;
  tags!: Table<Tag, string>;
  dictionaryMedia!: Table<DictionaryMedia, string>;
  archives!: Table<{ id: string; blob: Blob }, string>;
  phrases!: Table<Phrase, string>;
  vocabulary!: Table<Vocabulary, string>;
  reviews!: Table<Review, string>;
  audio!: Table<AudioRecord, string>;
  settings!: Table<{ id: string; value: Settings }, string>;
  nechybujte!: Table<{ term: string; result: LookupResult }, string>;
  exampleCorpora!: Table<
    { language: string; corpus: Blob; count: number; updated: number },
    string
  >;
  morphology!: Table<
    { language: string; data: Blob; count: number; updated: number },
    string
  >;

  constructor() {
    super("srs-reader");
    this.version(1).stores({
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
    this.version(2).stores({
      frequencies: "id, revisionId, [revisionId+folded]",
    });
    this.version(3).stores({ exampleCorpora: "language" });
    this.version(4).stores({ morphology: "language" });
    this.version(5).stores({ nechybujte: "term" });
    this.version(6)
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
}
export const db = new ReaderDatabase();
