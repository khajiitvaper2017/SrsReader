import type { AudioRecord } from "@/audio/model";
import type {
  Dictionary,
  DictionaryMedia,
  Entry,
  EntryMatch,
  Frequency,
  LookupResult,
  Phrase,
  Tag,
} from "@/dictionaries/model";
import { installMigrations } from "@/platform/database/migrations";
import type { AnalysisRecord } from "@/languages/analysis";
import type { CachedSentence } from "@/examples/sentence-model";
import type { Deck } from "@/srs/deck-model";
import type { Settings } from "@/settings/model";
import type {
  RwkvCard,
  RwkvEntity,
  RwkvMeta,
} from "@/srs/engines/rwkv/records";
import type { Review, SrsMeta } from "@/srs/history";
import type { Vocabulary } from "@/vocabulary/model";
import type {
  NoteType,
  Note,
  Card,
  CardAsset,
  AnkiReview,
} from "@/cards/model";
import type { ImportTask } from "@/imports/model";
import type { SyncMeta, SyncRecord } from "@/sync/model";
import { installSyncTracking } from "@/sync/tracking";
import Dexie, { type Table } from "dexie";

class ReaderDatabase extends Dexie {
  syncRecords!: Table<SyncRecord, string>;
  syncAuthored!: Table<SyncRecord, string>;
  syncDependencies!: Table<SyncRecord, [string, number]>;
  syncMeta!: Table<SyncMeta, string>;
  noteTypes!: Table<NoteType, string>;
  notes!: Table<Note, string>;
  cards!: Table<Card, string>;
  cardAssets!: Table<CardAsset, string>;
  ankiReviews!: Table<AnkiReview, string>;
  importTasks!: Table<ImportTask, string>;
  importFiles!: Table<{ id: string; blob: Blob }, string>;
  sentences!: Table<CachedSentence, string>;
  decks!: Table<Deck, string>;
  analyses!: Table<AnalysisRecord, string>;
  srsMeta!: Table<SrsMeta, string>;
  rwkvMeta!: Table<RwkvMeta, string>;
  rwkvEntities!: Table<RwkvEntity, string>;
  rwkvCards!: Table<RwkvCard, string>;
  dictionaries!: Table<Dictionary, string>;
  entries!: Table<Entry, string>;
  entryMatches!: Table<EntryMatch, string>;
  frequencies!: Table<Frequency, string>;
  tags!: Table<Tag, string>;
  dictionaryMedia!: Table<DictionaryMedia, string>;
  archives!: Table<{ id: string; blob: Blob }, string>;
  phrases!: Table<Phrase, string>;
  vocabulary!: Table<Vocabulary, string>;
  reviews!: Table<Review, string>;
  audio!: Table<AudioRecord, string>;
  settings!: Table<
    { id: string; value: Omit<Settings, "studyLanguage" | "nativeLanguage"> },
    string
  >;
  nechybujte!: Table<{ term: string; result: LookupResult }, string>;
  spanishdict!: Table<{ term: string; result: LookupResult }, string>;
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
    installMigrations(this);
    installSyncTracking(this);
  }
}
export const db = new ReaderDatabase();
