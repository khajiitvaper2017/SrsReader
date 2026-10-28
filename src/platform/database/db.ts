import type {
  ImmersionWord,
  ImmersionPassage,
} from "@/dictionaries/immersion-model";
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
import type { ImportTask } from "@/imports/model";
import Dexie, { type Table } from "dexie";

class ReaderDatabase extends Dexie {
  importTasks!: Table<ImportTask, string>;
  immersionWords!: Table<ImmersionWord, string>;
  immersionPassages!: Table<ImmersionPassage, string>;
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
  }
}
export const db = new ReaderDatabase();
