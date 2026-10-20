import { installMigrations } from "@/platform/database/migrations";
import type { FeatureCard, FeatureGlobal } from "@/srs/rwkv/features";
import type { Heads } from "@/srs/rwkv/model";
import type { StoredLayers } from "@/srs/rwkv/precision";
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
    installMigrations(this);
  }
}
export const db = new ReaderDatabase();
