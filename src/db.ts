import Dexie, { type Table } from "dexie";
import type {
  AudioRecord,
  Dictionary,
  DictionaryMedia,
  Entry,
  Frequency,
  Phrase,
  Review,
  Settings,
  Tag,
  Vocabulary,
  LookupResult,
} from "./model";

class ReaderDatabase extends Dexie {
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
  }
}
export const db = new ReaderDatabase();
