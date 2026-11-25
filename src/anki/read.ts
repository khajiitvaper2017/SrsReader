import {
  BlobReader,
  Uint8ArrayWriter,
  ZipReader,
  type Entry,
} from "@zip.js/zip.js";
import type { SqlValue } from "@sqlite.org/sqlite-wasm";
import { decompress } from "fzstd";
import { Proto } from "@/anki/protobuf";
import { parseJson } from "@/anki/json";
import { openCollection } from "@/anki/sqlite";
import type {
  AnkiCard,
  AnkiCollection,
  AnkiModel,
  AnkiNote,
  AnkiPreview,
  AnkiRevlog,
  RawObject,
} from "@/anki/model";
import {
  assetId,
  type CardAsset,
  type FieldBindings,
  type NoteType,
} from "@/cards/model";
import { loadCardAssets, requestedCardAsset } from "@/cards/sandbox/assets";
import { fieldMediaReferences, mediaType } from "@/anki/media";
import { matchesNoteType, previousFields, sameAnkiItem } from "@/anki/merge";
import { t } from "@/shared/i18n/i18n";
import { db } from "@/platform/database/db";
import { fieldText, templateWarnings } from "@/cards/template";
import { legacyPreset, modernPreset, presetForDeck } from "@/anki/deck-config";

const invalid = () => new Error(t("anki_invalid_package"));
const text = (value: unknown) => {
  if (typeof value !== "string") throw invalid();
  return value;
};
const integer = (value: unknown) => {
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "number" && typeof value !== "string") throw invalid();
  if (!/^-?\d+$/.test(String(value))) throw invalid();
  return String(value);
};
const number = (value: unknown) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw invalid();
  return result;
};
const object = (value: unknown): RawObject => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as RawObject;
};
const blob = (value: unknown) => {
  if (!(value instanceof Uint8Array)) throw invalid();
  return value;
};

function legacyModel(value: unknown, id: string): AnkiModel {
  const model = object(value);
  if (!Array.isArray(model.flds) || !Array.isArray(model.tmpls))
    throw invalid();
  const flds = model.flds.map((value, index) => {
    const field = object(value);
    return { ...field, name: text(field.name), ord: index };
  });
  const tmpls = model.tmpls.map((value, index) => {
    const template = object(value);
    return {
      ...template,
      name: text(template.name),
      ord: index,
      qfmt: text(template.qfmt),
      afmt: text(template.afmt ?? ""),
    };
  });
  if (
    !flds.length ||
    !tmpls.length ||
    new Set(flds.map((field) => field.name)).size !== flds.length
  )
    throw invalid();
  return {
    ...model,
    id,
    name: text(model.name),
    type: number(model.type),
    css: text(model.css ?? ""),
    flds,
    tmpls,
  };
}

function modernModels(
  rows: Record<string, unknown>[],
  fields: Record<string, unknown>[],
  templates: Record<string, unknown>[],
) {
  return rows.map((row): AnkiModel => {
    const id = integer(row.id);
    const config = new Proto(blob(row.config));
    const flds = fields
      .filter((field) => integer(field.ntid) === id)
      .sort((a, b) => number(a.ord) - number(b.ord))
      .map((field) => {
        const f = new Proto(blob(field.config));
        return {
          ...f.other(),
          name: text(field.name),
          ord: number(field.ord),
          sticky: !!f.number(1),
          rtl: !!f.number(2),
          font: f.text(3) || "Arial",
          size: f.number(4, 20),
          description: f.text(5),
          plainText: !!f.number(6),
          collapsed: !!f.number(7),
          excludeFromSearch: !!f.number(8),
          ...(f.integer(9) ? { id: f.integer(9) } : {}),
          ...(f.values(10).length ? { tag: f.number(10) } : {}),
          preventDeletion: !!f.number(11),
        };
      });
    const tmpls = templates
      .filter((template) => integer(template.ntid) === id)
      .sort((a, b) => number(a.ord) - number(b.ord))
      .map((template) => {
        const f = new Proto(blob(template.config));
        return {
          ...f.other(),
          name: text(template.name),
          ord: number(template.ord),
          qfmt: f.text(1),
          afmt: f.text(2),
          bqfmt: f.text(3),
          bafmt: f.text(4),
          did: f.integer(5) || null,
          bfont: f.text(6),
          bsize: f.number(7),
          ...(f.integer(8) ? { id: f.integer(8) } : {}),
        };
      });
    const req = config.values(8).map((value) => {
      if (!(value instanceof Uint8Array)) throw invalid();
      const entry = new Proto(value);
      const ordinals: number[] = [];
      for (const value of entry.values(3)) {
        if (typeof value === "bigint") ordinals.push(Number(value));
        else {
          // Packed uint32 fields use the same varint representation without tags.
          let n = 0,
            shift = 0;
          for (const byte of value) {
            n |= (byte & 127) << shift;
            if (byte & 128) shift += 7;
            else {
              ordinals.push(n);
              n = shift = 0;
            }
          }
        }
      }
      return [
        entry.number(1),
        ["none", "any", "all"][entry.number(2)],
        ordinals,
      ];
    });
    return legacyModel(
      {
        ...config.other(),
        name: text(row.name),
        type: config.number(1),
        css: config.text(3),
        sortf: config.number(2),
        did: config.integer(4) || null,
        latexPre: config.text(5),
        latexPost: config.text(6),
        latexsvg: !!config.number(7),
        req,
        originalStockKind: config.number(9),
        ...(config.integer(10) ? { originalId: config.integer(10) } : {}),
        mod: number(row.mtime_secs),
        usn: number(row.usn),
        flds,
        tmpls,
      },
      id,
    );
  });
}

function modernDeck(row: Record<string, unknown>) {
  const common = new Proto(blob(row.common));
  const kind = new Proto(blob(row.kind));
  const normal = new Proto(kind.bytes(1));
  return {
    ...common.other(),
    id: integer(row.id),
    name: text(row.name).replaceAll("\x1f", "::"),
    mod: number(row.mtime_secs),
    usn: number(row.usn),
    collapsed: !!common.number(1),
    browserCollapsed: !!common.number(2),
    desc: normal.text(4),
    conf: normal.integer(1) || "1",
    extendNew: normal.number(2),
    extendRev: normal.number(3),
    ...(normal.values(6).length ? { reviewLimit: normal.number(6) } : {}),
    ...(normal.values(7).length ? { newLimit: normal.number(7) } : {}),
    ...(normal.values(10).length
      ? { desiredRetention: (normal.floats(10)[0] ?? 0) * 100 }
      : {}),
    dyn: kind.values(2).length ? 1 : 0,
  };
}

async function collectionFromBytes(
  bytes: Uint8Array,
  report?: (done: number, total: number) => void,
): Promise<AnkiCollection> {
  const database = await openCollection(bytes);
  try {
    const rows = (name: string) =>
      database.selectObjects(`SELECT * FROM ${name} NOT INDEXED`);
    const total = report
      ? ["notes", "cards", "revlog"].reduce(
          (sum, name) =>
            sum + number(database.selectValue(`SELECT count(*) FROM ${name}`)),
          0,
        )
      : 0;
    let done = 0;
    report?.(done, total);
    const mapRows = <T>(name: string, convert: (row: RawObject) => T): T[] => {
      const statement = database.prepare(`SELECT * FROM ${name} NOT INDEXED`);
      try {
        const columns = statement.getColumnNames();
        const values: SqlValue[] = [];
        const row: RawObject = Object.create(null);
        const result: T[] = [];
        // Reuse the raw row instead of retaining a second copy of every table.
        while (statement.step()) {
          statement.get(values);
          for (let index = 0; index < columns.length; index++)
            row[columns[index]!] = values[index];
          result.push(convert(row));
          if (report && ++done % 2048 === 0) report(done, total);
        }
        report?.(done, total);
        return result;
      } finally {
        statement.finalize();
      }
    };
    const [col] = rows("col");
    if (!col) throw invalid();
    const modern = number(col.ver) >= 15;
    const models = modern
      ? modernModels(rows("notetypes"), rows("fields"), rows("templates"))
      : Object.entries(object(parseJson(text(col.models)))).map(([id, value]) =>
          legacyModel(value, id),
        );
    const decks: AnkiCollection["decks"] = modern
      ? rows("decks").map(modernDeck)
      : Object.entries(object(parseJson(text(col.decks)))).map(
          ([id, value]) => ({
            ...object(value),
            id,
            name: text(object(value).name),
          }),
        );
    const presets = new Map(
      modern
        ? rows("deck_config").map(
            (row) =>
              [
                integer(row.id),
                modernPreset(text(row.name), new Proto(blob(row.config))),
              ] as const,
          )
        : Object.entries(object(parseJson(text(col.dconf) || "{}"))).map(
            ([id, preset]) => [id, legacyPreset(object(preset))] as const,
          ),
    );
    const deckPresets = new Map(
      decks.flatMap((deck) => {
        const preset = presetForDeck(deck, presets.get(String(deck.conf ?? 1)));
        return preset ? [[deck.id, preset] as const] : [];
      }),
    );
    const notes = mapRows("notes", (row): AnkiNote => ({
      id: integer(row.id),
      guid: text(row.guid),
      mid: integer(row.mid),
      mod: number(row.mod),
      usn: number(row.usn),
      tags: text(row.tags),
      flds: text(row.flds),
      sfld: typeof row.sfld === "string" ? row.sfld : number(row.sfld),
      csum: number(row.csum),
      flags: number(row.flags),
      data: text(row.data),
    }));
    const cards = mapRows("cards", (row): AnkiCard => ({
      id: integer(row.id),
      nid: integer(row.nid),
      did: integer(row.did),
      ord: number(row.ord),
      mod: number(row.mod),
      usn: number(row.usn),
      type: number(row.type),
      queue: number(row.queue),
      due: number(row.due),
      ivl: number(row.ivl),
      factor: number(row.factor),
      reps: number(row.reps),
      lapses: number(row.lapses),
      left: number(row.left),
      odue: number(row.odue),
      odid: integer(row.odid),
      flags: number(row.flags),
      data: text(row.data),
    }));
    const reviews = mapRows("revlog", (row): AnkiRevlog => ({
      id: integer(row.id),
      cid: integer(row.cid),
      usn: number(row.usn),
      ease: number(row.ease),
      ivl: number(row.ivl),
      lastIvl: number(row.lastIvl),
      factor: number(row.factor),
      time: number(row.time),
      type: number(row.type),
    }));
    const modelById = new Map(models.map((model) => [model.id, model]));
    const noteById = new Map(notes.map((note) => [note.id, note]));
    for (const note of notes)
      if (
        note.flds.split("\x1f").length !== modelById.get(note.mid)?.flds.length
      )
        throw invalid();
    for (const card of cards) {
      const note = noteById.get(card.nid);
      const model = note && modelById.get(note.mid);
      if (
        !model ||
        card.ord < 0 ||
        (model.type !== 1 && !model.tmpls[card.ord])
      )
        throw invalid();
    }
    return {
      created: number(col.crt),
      models,
      decks,
      deckPresets,
      notes,
      cards,
      reviews,
    };
  } finally {
    database.close();
  }
}

export class PackageReader {
  private archive: ZipReader<Blob>;
  private entries = new Map<string, Entry>();
  compressed = false;
  media: { name: string; entry: string; size?: number }[] = [];
  missingMedia = new Set<string>();

  constructor(file: Blob) {
    this.archive = new ZipReader(new BlobReader(file));
  }
  async open(report?: (done: number, total: number) => void) {
    for (const entry of await this.archive.getEntries()) {
      if (this.entries.has(entry.filename)) throw invalid();
      this.entries.set(entry.filename, entry);
    }
    let version = this.entries.has("collection.anki21") ? 2 : 1;
    if (this.entries.has("meta"))
      version = new Proto(await this.bytes("meta")).number(1);
    if (![1, 2, 3].includes(version)) throw invalid();
    this.compressed = version === 3;
    const databaseName = [
      "",
      "collection.anki2",
      "collection.anki21",
      "collection.anki21b",
    ][version]!;
    const collection = await collectionFromBytes(
      await this.bytes(databaseName, this.compressed),
      report,
    );
    if (this.entries.has("media")) {
      const bytes = await this.bytes("media", this.compressed);
      this.media = this.compressed
        ? new Proto(bytes).values(1).map((value, index) => {
            if (!(value instanceof Uint8Array)) throw invalid();
            const item = new Proto(value);
            return {
              name: item.text(1),
              entry: String(index),
              size: item.number(2),
            };
          })
        : Object.entries(
            object(JSON.parse(new TextDecoder().decode(bytes))),
          ).map(([entry, name]) => ({ name: text(name), entry }));
      const names = new Set<string>();
      for (const item of this.media) {
        if (
          !item.name ||
          /[/\\\0]/.test(item.name) ||
          !/^\d+$/.test(item.entry) ||
          names.has(item.name)
        )
          throw invalid();
        names.add(item.name);
        if (!this.entries.has(item.entry)) this.missingMedia.add(item.name);
      }
      this.media = this.media.filter(
        (item) => !this.missingMedia.has(item.name),
      );
    }
    return collection;
  }
  async bytes(name: string, compressed = false) {
    const entry = this.entries.get(name);
    if (!entry || entry.directory || !entry.getData) throw invalid();
    const bytes = await entry.getData(new Uint8ArrayWriter());
    // shortcut: fzstd supports 32 MiB windows; use a streaming WASM decoder if Anki exceeds this.
    return compressed && bytes.length ? decompress(bytes) : bytes;
  }
  close() {
    return this.archive.close();
  }
}

function suggestedBindings(
  model: AnkiModel,
  previous?: NoteType,
): FieldBindings {
  const bindings: FieldBindings = {};
  const aliases: Record<keyof FieldBindings, RegExp> = {
    word: /^(word|expression|term|vocab(?:ulary)?|front|слово|wyraz|słówko|polski|expression|表現|単語|語彙|見出し語)$/iu,
    reading:
      /^(reading|pronunciation|ipa|kana|読み|読み方|振り仮名|ふりがな|word reading)$/iu,
    definitions:
      /^(meaning|definition|definitions|back|значення|значение|訳|意味|translation|english|angielski|znaczenie)$/iu,
    pos: /^(pos|part[ _-]?of[ _-]?speech|wortart|частина мови)$/iu,
    hint: /^(srshint\d*|hint|disambig(?:uation)?|підказка)$/iu,
    sentence:
      /^(sentence|example|sentence[ _-]?text|пример|приклад|例文|文|zdanie)$/iu,
    sentenceFurigana:
      /^(sentence[ _-]?furigana|sentence[ _-]?reading|例文読み)$/iu,
    translation:
      /^(sentence[ _-]?translation|translation[ _-]?sentence|переклад речення|例文訳)$/iu,
    wordAudio: /^(audio|sound|word[ _-]?audio|звук|音声)$/iu,
    sentenceAudio: /^(sentence[ _-]?audio|例文音声)$/iu,
    image: /^(image|picture|illustration|картинка|зображення|画像)$/iu,
  };
  for (const key of Object.keys(aliases) as (keyof FieldBindings)[]) {
    const oldIndex = previous?.bindings[key];
    const oldField =
      previous && oldIndex !== undefined
        ? previousFields(previous)[oldIndex]
        : undefined;
    let index = oldField
      ? model.flds.findIndex((field) => sameAnkiItem(oldField, field))
      : -1;
    if (index === -1)
      index = model.flds.findIndex((field) =>
        aliases[key].test(field.name.trim()),
      );
    if (index !== -1) bindings[key] = index;
  }
  return bindings;
}

export async function incompatibleNoteTypeIds(models: AnkiModel[]) {
  const active = new Set(await db.notes.orderBy("noteTypeId").uniqueKeys());
  const existing = (await db.noteTypes.toArray()).filter(
    (type) => type.sourceId !== undefined && active.has(type.id),
  );
  return models
    .filter((model) =>
      existing.some(
        (type) =>
          matchesNoteType(model, type) &&
          (type.kind !== (model.type === 1 ? "cloze" : "standard") ||
            JSON.stringify(type.fields.map((field) => field.name)) !==
              JSON.stringify(model.flds.map((field) => field.name)) ||
            JSON.stringify(type.templates.map((template) => template.name)) !==
              JSON.stringify(model.tmpls.map((template) => template.name))),
      ),
    )
    .map((model) => model.id);
}

export async function inspectPackage(file: Blob): Promise<AnkiPreview> {
  const reader = new PackageReader(file);
  try {
    const collection = await reader.open();
    const existingTypes = (await db.noteTypes.toArray()).sort(
      (a, b) => b.fields.length - a.fields.length,
    );
    const notes = new Map(collection.notes.map((note) => [note.id, note]));
    const namespace = `anki-preview:${crypto.randomUUID()}`;
    const media = new Map(reader.media.map((item) => [item.name, item]));
    const missing = new Set(reader.missingMedia);
    const checkMedia = (value: string) => {
      for (const names of fieldMediaReferences(value))
        if (!names.some((name) => media.has(name))) missing.add(names.at(-1)!);
    };
    for (const note of collection.notes) checkMedia(note.flds);
    for (const model of collection.models) {
      checkMedia(model.css);
      for (const template of model.tmpls) {
        checkMedia(template.qfmt);
        checkMedia(template.afmt);
      }
    }
    const assets = new Map<string, Promise<CardAsset | undefined>>();
    function getAsset(name: string) {
      let result = assets.get(name);
      if (!result) {
        result = (async () => {
          const item = media.get(name);
          if (!item) return;
          const bytes = await reader.bytes(item.entry, reader.compressed);
          if (item.size !== undefined && item.size !== bytes.byteLength)
            throw invalid();
          const mime = mediaType(name);
          return {
            id: assetId(namespace, name),
            namespace,
            name,
            mime,
            blob: new Blob([bytes.slice().buffer], { type: mime }),
          };
        })();
        assets.set(name, result);
      }
      return result;
    }
    const cardDeckId = (card: AnkiCard) =>
      card.odid !== "0" ? card.odid : card.did;
    const deckNames = new Map(
      collection.decks.map((deck) => [deck.id, deck.name]),
    );
    return {
      loadAssets: (namespace, html, css, _source, dictionaryAssets) =>
        loadCardAssets(
          namespace,
          html,
          css,
          {
            names: [...media.keys()],
            get: getAsset,
          },
          dictionaryAssets,
        ),
      requestAsset: (namespace, name) =>
        requestedCardAsset(namespace, name, getAsset),
      close: () => reader.close(),
      noteTypes: collection.models.flatMap((model) => {
        const cards = collection.cards.filter(
          (card) => notes.get(card.nid)?.mid === model.id,
        );
        if (!cards.length) return [];
        const noteType: NoteType = {
          id: model.id,
          name: model.name,
          kind: model.type === 1 ? "cloze" : "standard",
          fields: model.flds.map((field) => ({ name: field.name })),
          templates: model.tmpls.map((template) => ({
            name: template.name,
            front: template.qfmt,
            back: template.afmt,
          })),
          css: model.css,
          bindings: suggestedBindings(
            model,
            existingTypes.find((type) => matchesNoteType(model, type)),
          ),
          created: 0,
        };
        const sampleCards = new Map(cards.map((card) => [card.id, card]));
        const sampleNotes = new Map<
          string,
          { label: string; filled: number }
        >();
        const samples = cards
          .map((card) => {
            let sample = sampleNotes.get(card.nid);
            if (!sample) {
              const note = notes.get(card.nid)!;
              const fields = note.flds.split("\x1f");
              sample = {
                label: fieldText(
                  fields[noteType.bindings.word ?? Number(model.sortf ?? 0)] ||
                    String(note.sfld),
                )
                  .replace(/\[sound:[^\]]*\]/g, "")
                  .trim()
                  .slice(0, 100),
                filled: fields.filter(
                  (field) =>
                    fieldText(field).trim() ||
                    /<(?:img|audio|video|svg)\b|\[sound:/i.test(field),
                ).length,
              };
              sampleNotes.set(card.nid, sample);
            }
            const deckId = cardDeckId(card);
            return {
              ...sample,
              cardId: card.id,
              deckId,
              deckName: deckNames.get(deckId) ?? "",
              ordinal: card.ord,
            };
          })
          .sort((a, b) => b.filled - a.filled || a.ordinal - b.ordinal);
        const sampleDocument: AnkiPreview["noteTypes"][number]["sampleDocument"] =
          (id) => {
            const card = sampleCards.get(id)!;
            const note = notes.get(card.nid)!;
            return {
              noteType,
              note: {
                id: note.id,
                noteTypeId: model.id,
                language: "",
                fields: note.flds.split("\x1f"),
                tags: note.tags.trim().split(/\s+/).filter(Boolean),
                mediaNamespace: namespace,
                version: 0,
                created: 0,
                updated: 0,
              },
              card: {
                id: card.id,
                noteId: note.id,
                templateOrdinal: card.ord,
                deckId: null,
                language: "",
                schedule: null,
                suspended: card.queue === -1,
                leech: false,
                retentionOverride: null,
                srsVersion: 0,
                version: 0,
                created: 0,
                updated: 0,
                sourceId: card.id,
                source: { flags: card.flags },
              },
            };
          };
        return [
          {
            id: model.id,
            name: model.name,
            kind: noteType.kind,
            fields: model.flds.map((field) => field.name),
            templates: model.tmpls.length,
            notes: collection.notes.filter((note) => note.mid === model.id)
              .length,
            cards: cards.length,
            suggestedBindings: noteType.bindings,
            samples,
            sampleDocument,
            deckIds: [...new Set(cards.map(cardDeckId))],
          },
        ];
      }),
      decks: collection.decks
        .map((deck) => ({
          id: deck.id,
          name: deck.name,
          preset: collection.deckPresets.has(deck.id)
            ? (collection.deckPresets.get(deck.id)?.name ??
              t("anki_unnamed_preset"))
            : undefined,
          cards: collection.cards.filter((card) => cardDeckId(card) === deck.id)
            .length,
        }))
        .filter((deck) => deck.cards > 0),
      notes: collection.notes.length,
      cards: collection.cards.length,
      media: reader.media.length,
      reviews: collection.reviews.length,
      suspended: collection.cards.filter((card) => card.queue === -1).length,
      warnings: [
        ...(missing.size
          ? [t("anki_missing_media", { count: missing.size })]
          : []),
        ...collection.models.flatMap((model) => {
          const templates = model.tmpls.map((template) => ({
            name: template.name,
            front: template.qfmt,
            back: template.afmt,
          }));
          const filters = templateWarnings({ templates });
          const unsupported = [
            ...new Set(
              JSON.stringify(model).match(
                /MathJax|image[-_ ]occlusion|AnkiConnect|HyperTTS/gi,
              ) ?? [],
            ),
          ];
          return [
            ...(filters.length
              ? [
                  `${model.name}: ${t("card_template_unsupported", { filters: filters.join(", ") })}`,
                ]
              : []),
            ...(unsupported.length
              ? [
                  t("anki_unsupported_features", {
                    name: model.name,
                    features: unsupported.join(", "),
                  }),
                ]
              : []),
          ];
        }),
      ],
      incompatibleNoteTypes: await incompatibleNoteTypeIds(collection.models),
    };
  } catch (error) {
    await reader.close();
    throw error;
  }
}
