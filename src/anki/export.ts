import { deckIdsInTree, deckTree } from "@/srs/deck-tree";
import { scheduleSchema } from "@/srs/model";
import {
  BlobReader,
  BlobWriter,
  TextReader,
  Uint8ArrayReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { sqlite } from "@/anki/sqlite";
import { stringifyJson } from "@/anki/json";
import type { RawObject } from "@/anki/model";
import type { Card, CardAsset, Note, NoteType } from "@/cards/model";
import { parseHTML } from "linkedom";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import type { ImportProgress } from "@/shared/download";
import type { Review } from "@/srs/history";

const schema = `
CREATE TABLE col(id integer PRIMARY KEY,crt integer NOT NULL,mod integer NOT NULL,scm integer NOT NULL,ver integer NOT NULL,dty integer NOT NULL,usn integer NOT NULL,ls integer NOT NULL,conf text NOT NULL,models text NOT NULL,decks text NOT NULL,dconf text NOT NULL,tags text NOT NULL);
CREATE TABLE notes(id integer PRIMARY KEY,guid text NOT NULL,mid integer NOT NULL,mod integer NOT NULL,usn integer NOT NULL,tags text NOT NULL,flds text NOT NULL,sfld integer NOT NULL,csum integer NOT NULL,flags integer NOT NULL,data text NOT NULL);
CREATE TABLE cards(id integer PRIMARY KEY,nid integer NOT NULL,did integer NOT NULL,ord integer NOT NULL,mod integer NOT NULL,usn integer NOT NULL,type integer NOT NULL,queue integer NOT NULL,due integer NOT NULL,ivl integer NOT NULL,factor integer NOT NULL,reps integer NOT NULL,lapses integer NOT NULL,left integer NOT NULL,odue integer NOT NULL,odid integer NOT NULL,flags integer NOT NULL,data text NOT NULL);
CREATE TABLE revlog(id integer PRIMARY KEY,cid integer NOT NULL,usn integer NOT NULL,ease integer NOT NULL,ivl integer NOT NULL,lastIvl integer NOT NULL,factor integer NOT NULL,time integer NOT NULL,type integer NOT NULL);
CREATE TABLE graves(usn integer NOT NULL,oid integer NOT NULL,type integer NOT NULL);
CREATE INDEX ix_notes_usn ON notes(usn);
CREATE INDEX ix_cards_usn ON cards(usn);
CREATE INDEX ix_revlog_usn ON revlog(usn);
CREATE INDEX ix_cards_nid ON cards(nid);
CREATE INDEX ix_cards_sched ON cards(did,queue,due);
CREATE INDEX ix_revlog_cid ON revlog(cid);
CREATE INDEX ix_notes_csum ON notes(csum);`;

function allocator() {
  const used = new Set<string>();
  let next = BigInt(Date.now());
  return (preferred?: unknown) => {
    if (
      (typeof preferred === "number" || typeof preferred === "string") &&
      /^\d+$/.test(String(preferred)) &&
      BigInt(preferred) > 0
    ) {
      let value = BigInt(preferred);
      while (used.has(String(value))) value++;
      used.add(String(value));
      return value;
    }
    while (used.has(String(next))) next++;
    const value = next++;
    used.add(String(value));
    return value;
  };
}
const object = (value: unknown): RawObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawObject)
    : {};
const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const hash = async (bytes: Uint8Array<ArrayBuffer>, algorithm = "SHA-256") =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest(algorithm, bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

function plainField(value: string) {
  const { document } = parseHTML(`<html><body>${value}</body></html>`);
  document
    .querySelectorAll("script,style")
    .forEach((element) => element.remove());
  document
    .querySelectorAll("img")
    .forEach((element) =>
      element.replaceWith(` ${element.getAttribute("src") ?? ""} `),
    );
  return document.body.textContent ?? "";
}

function renameReferences(value: string, names: Map<string, string>) {
  if (!names.size) return value;
  const replacement = (name: string) => {
    const direct = names.get(name);
    if (direct) return direct;
    try {
      return names.get(decodeURIComponent(name.replace(/&amp;/g, "&"))) ?? name;
    } catch {
      return name;
    }
  };
  return value
    .replace(
      /\[sound:([^\]]+)\]/g,
      (_all, name: string) => `[sound:${replacement(name)}]`,
    )
    .replace(
      /(["'])([^"'\\\r\n]+)\1/g,
      (_all, quote: string, name: string) =>
        `${quote}${replacement(name)}${quote}`,
    )
    .replace(
      /url\(\s*(["']?)(.*?)\1\s*\)/gi,
      (all, quote: string, name: string) =>
        replacement(name) === name
          ? all
          : `url(${quote}${replacement(name)}${quote})`,
    )
    .replace(
      /\b(src|href|poster|data)\s*=\s*([^\s"'=<>`]+)/gi,
      (all, attribute: string, name: string) =>
        replacement(name) === name ? all : `${attribute}=${replacement(name)}`,
    );
}

async function mediaNames(assets: CardAsset[]) {
  const namespaces = new Map<string, Map<string, string>>();
  const used = new Map<string, CardAsset>();
  const hashes = new Map<string, string>();
  const digest = async (asset: CardAsset) => {
    let value = hashes.get(asset.id);
    if (!value) {
      value = await hash(new Uint8Array(await asset.blob.arrayBuffer()));
      hashes.set(asset.id, value);
    }
    return value;
  };
  const uniqueName = async (asset: CardAsset) => {
    const suffix = await hash(new TextEncoder().encode(asset.id));
    const extension = asset.name.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? "";
    return `srs_${suffix}${extension}`;
  };
  for (const asset of assets) {
    const names = namespaces.get(asset.namespace) ?? new Map<string, string>();
    namespaces.set(asset.namespace, names);
    let target = asset.name;
    const existing = used.get(target);
    if (
      existing &&
      (existing.blob.size !== asset.blob.size ||
        (await digest(existing)) !== (await digest(asset)))
    )
      target = await uniqueName(asset);
    names.set(asset.name, target);
    used.set(target, asset);
  }
  // Shared style/script bytes can reference different images in separate media namespaces.
  for (const asset of assets) {
    const names = namespaces.get(asset.namespace)!;
    if (
      /\.(?:css|js)$/i.test(asset.name) &&
      [...names].some(([name, target]) => name !== target)
    )
      names.set(asset.name, await uniqueName(asset));
  }
  const files = new Map<
    string,
    { asset: CardAsset; names: Map<string, string> }
  >();
  const changes = new Map(
    [...namespaces].map(([namespace, names]) => [
      namespace,
      new Map([...names].filter(([name, target]) => name !== target)),
    ]),
  );
  for (const asset of assets) {
    const names = namespaces.get(asset.namespace)!;
    files.set(names.get(asset.name)!, {
      asset,
      names: changes.get(asset.namespace)!,
    });
  }
  return { namespaces: changes, files };
}

function runtimeFields(type: NoteType) {
  const templates = type.templates
    .map((template) => template.front + template.back)
    .join("\n");
  return ["SrsSentenceFront", "SrsShowReading", "SrsShowPartOfSpeech"].filter(
    (name) =>
      !type.fields.some((field) => field.name === name) &&
      new RegExp(`\\{\\{\\s*[#^/]?\\s*${name}\\s*\\}\\}`).test(templates),
  );
}

function rawModel(type: NoteType, id: bigint, names: Map<string, string>) {
  const source = type.source ?? {};
  const sourceFields = Array.isArray(source.flds)
    ? source.flds.map(object)
    : [];
  const sourceTemplates = Array.isArray(source.tmpls)
    ? source.tmpls.map(object)
    : [];
  const fields = type.fields.map((field, index) => ({
    sticky: false,
    rtl: false,
    font: "Arial",
    size: 20,
    ...sourceFields[index],
    name: field.name,
    ord: index,
  }));
  for (const name of runtimeFields(type))
    fields.push({
      name,
      ord: fields.length,
      sticky: false,
      rtl: false,
      font: "Arial",
      size: 20,
    });
  return {
    ...source,
    id: String(id),
    name: type.name,
    type: type.kind === "cloze" ? 1 : 0,
    mod: 0,
    usn: -1,
    sortf:
      typeof source.sortf === "number" && source.sortf < fields.length
        ? source.sortf
        : 0,
    did: null,
    flds: fields,
    tmpls: type.templates.map((template, index) => ({
      ...sourceTemplates[index],
      name: template.name,
      ord: index,
      qfmt: renameReferences(template.front, names),
      afmt: renameReferences(template.back, names),
      bqfmt: renameReferences(text(sourceTemplates[index]?.bqfmt), names),
      bafmt: renameReferences(text(sourceTemplates[index]?.bafmt), names),
      did: null,
    })),
    css: renameReferences(type.css, names),
    latexPre: text(source.latexPre),
    latexPost: text(source.latexPost),
    latexsvg: !!source.latexsvg,
    req: Array.isArray(source.req)
      ? source.req
      : type.templates.map((_, index) => [
          index,
          "any",
          type.fields.map((_, index) => index),
        ]),
  };
}

function scheduleRow(card: Card, created: number, position: number) {
  const state = card.schedule;
  const type = state?.state ?? 0;
  const queue =
    card.suspended || !state
      ? -1
      : type === 0
        ? 0
        : type === 2
          ? 2
          : state.interday
            ? 3
            : 1;
  const due =
    !state || type === 0
      ? position
      : type === 2 || state.interday
        ? Math.max(
            0,
            Math.floor(state.dueAt / 86400000) - Math.floor(created / 86400),
          )
        : Math.floor(state.dueAt / 1000);
  let data = object(
    (() => {
      try {
        return JSON.parse(text(card.source?.data, "{}"));
      } catch {
        return {};
      }
    })(),
  );
  if (state?.stability)
    data = { ...data, s: state.stability, d: state.difficulty };
  return [
    type,
    queue,
    due,
    Math.max(0, Math.round(state?.scheduledDays ?? 0)),
    state?.difficulty
      ? Math.round(100 + ((state.difficulty - 1) / 9) * 1000)
      : Number(card.source?.factor) || 2500,
    state?.reps ?? 0,
    state?.lapses ?? 0,
    state?.learningStep ?? 0,
    0,
    0,
    Number(card.source?.flags) || 0,
    JSON.stringify(data),
  ];
}

const interval = (days: number | undefined) =>
  !days
    ? 0
    : days < 1
      ? -Math.max(1, Math.round(days * 86400))
      : Math.round(days);
function reviewRow(review: Review) {
  const before = review.before?.schedule
    ? scheduleSchema.parse(review.before.schedule)
    : null;
  const after = review.after ? scheduleSchema.parse(review.after) : null;
  const state = before?.state ?? 0;
  return [
    -1,
    review.rating,
    interval(after?.scheduledDays),
    interval(before?.scheduledDays),
    after?.difficulty
      ? Math.round(100 + ((after.difficulty - 1) / 9) * 1000)
      : 2500,
    Math.round(review.durationMs ?? 0),
    state === 2 ? 1 : state === 3 ? 2 : 0,
  ];
}

export async function exportPackage(
  language?: string,
  deckId?: string,
  report: (progress: ImportProgress) => void = () => {},
): Promise<Blob> {
  const snapshot = await srsWrite(() =>
    db.transaction(
      "r",
      [
        db.cards,
        db.notes,
        db.noteTypes,
        db.cardAssets,
        db.ankiReviews,
        db.reviews,
        db.decks,
      ],
      async () => {
        const allDecks = await db.decks.toArray();
        const selectedDecks = deckId
          ? new Set(
              deckIdsInTree(
                allDecks.filter(
                  (deck) => !language || deck.language === language,
                ),
                deckId,
              ),
            )
          : undefined;
        const cards = (
          language
            ? await db.cards.where("language").equals(language).toArray()
            : await db.cards.toArray()
        ).filter((card) => !selectedDecks || selectedDecks.has(card.deckId!));
        const noteIds = [...new Set(cards.map((card) => card.noteId))];
        const notes = (await db.notes.bulkGet(noteIds)).filter(
          (note): note is Note => !!note,
        );
        const types = (
          await db.noteTypes.bulkGet([
            ...new Set(notes.map((note) => note.noteTypeId)),
          ])
        ).filter((type): type is NoteType => !!type);
        const assets = notes.length
          ? await db.cardAssets
              .where("namespace")
              .anyOf([...new Set(notes.map((note) => note.mediaNamespace))])
              .toArray()
          : [];
        const ids = cards.map((card) => card.id);
        const reviews = ids.length
          ? await db.reviews
              .where("cardId")
              .anyOf(ids)
              .filter((review) => review.active)
              .toArray()
          : [];
        const rawReviews = ids.length
          ? await db.ankiReviews.where("cardId").anyOf(ids).toArray()
          : [];
        return {
          cards,
          notes,
          types,
          assets,
          reviews,
          rawReviews,
          decks: deckTree(allDecks),
        };
      },
    ),
  );
  const api = await sqlite(),
    database = new api.oo1.DB();
  const writer = new ZipWriter(new BlobWriter("application/octet-stream"));
  try {
    report({
      phase: t("anki_export_cards"),
      done: 0,
      total: snapshot.cards.length,
    });
    const settings = await getSettings();
    const media = await mediaNames(snapshot.assets);
    const modelIds = allocator(),
      noteIds = allocator(),
      cardIds = allocator(),
      deckIds = allocator(),
      reviewIds = allocator();
    const models: RawObject = {},
      decks: RawObject = {};
    const modelByContent = new Map<string, bigint>(),
      modelByNamespace = new Map<string, bigint>(),
      modelByNote = new Map<string, bigint>();
    const noteMap = new Map<string, bigint>(),
      cardMap = new Map<string, bigint>(),
      deckMap = new Map<string | null, bigint>();
    const typeMap = new Map(snapshot.types.map((type) => [type.id, type]));
    const notes = new Map(snapshot.notes.map((note) => [note.id, note]));
    const created = Math.floor(Date.now() / 86400000) * 86400;
    const now = Date.now(),
      seconds = Math.floor(now / 1000);
    for (const note of snapshot.notes) {
      const type = typeMap.get(note.noteTypeId);
      if (!type) throw new Error(t("anki_invalid_package"));
      const namespaceKey = JSON.stringify([type.id, note.mediaNamespace]);
      let id = modelByNamespace.get(namespaceKey);
      if (!id) {
        const names = media.namespaces.get(note.mediaNamespace) ?? new Map();
        const model = rawModel(type, 0n, names);
        const key = JSON.stringify(model);
        id = modelByContent.get(key);
        if (!id) {
          id = modelIds(type.sourceId);
          const sameName = Object.values(models).filter(
            (model) => object(model).name === type.name,
          ).length;
          models[String(id)] = {
            ...model,
            id: String(id),
            mod: seconds,
            name: sameName ? `${type.name} (${sameName + 1})` : type.name,
          };
          modelByContent.set(key, id);
        }
        modelByNamespace.set(namespaceKey, id);
      }
      modelByNote.set(note.id, id);
      noteMap.set(note.id, noteIds(note.sourceId ?? note.created));
    }
    for (const card of snapshot.cards) {
      cardMap.set(card.id, cardIds(card.sourceId ?? card.created));
      if (deckMap.has(card.deckId)) continue;
      const deck = snapshot.decks.find((deck) => deck.id === card.deckId);
      const original = object(card.source?.deck);
      const id = deckIds(original.id ?? (card.deckId === null ? 1 : undefined));
      deckMap.set(card.deckId, id);
      decks[String(id)] = {
        ...original,
        id: String(id),
        name: deck?.name || "Default",
        mod: seconds,
        usn: -1,
        dyn: 0,
        conf: 1,
        desc: text(original.desc),
        collapsed: false,
        browserCollapsed: false,
        extendNew: 0,
        extendRev: 0,
        newToday: [0, 0],
        revToday: [0, 0],
        lrnToday: [0, 0],
        timeToday: [0, 0],
      };
    }
    if (!deckMap.size) {
      deckMap.set(null, 1n);
      decks["1"] = {
        id: "1",
        name: "Default",
        mod: seconds,
        usn: -1,
        dyn: 0,
        conf: 1,
        desc: "",
        collapsed: false,
        browserCollapsed: false,
        extendNew: 0,
        extendRev: 0,
        newToday: [0, 0],
        revToday: [0, 0],
        lrnToday: [0, 0],
        timeToday: [0, 0],
      };
    }
    database.exec(schema);
    database.exec("BEGIN");
    const insertNote = database.prepare(
      "INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    );
    try {
      for (const note of snapshot.notes) {
        const type = typeMap.get(note.noteTypeId)!;
        const names = media.namespaces.get(note.mediaNamespace) ?? new Map();
        const fields = note.fields.map((field) =>
          renameReferences(field, names),
        );
        for (const name of runtimeFields(type))
          fields.push(
            name === "SrsSentenceFront"
              ? settings.front === "sentence"
                ? "1"
                : ""
              : name === "SrsShowPartOfSpeech"
                ? settings.showPartOfSpeech
                  ? "1"
                  : ""
                : "1",
          );
        const sortIndex = Number(type.source?.sortf) || 0;
        const sortField = plainField(fields[sortIndex] ?? fields[0] ?? "");
        const checksum = Number.parseInt(
          (
            await hash(
              new TextEncoder().encode(plainField(fields[0] ?? "")),
              "SHA-1",
            )
          ).slice(0, 8),
          16,
        );
        const guid =
          text(note.source?.guid) ||
          (await hash(new TextEncoder().encode(note.id))).slice(0, 20);
        insertNote
          .bind([
            noteMap.get(note.id)!,
            guid,
            modelByNote.get(note.id)!,
            seconds,
            -1,
            note.tags.length ? ` ${note.tags.join(" ")} ` : "",
            fields.join("\x1f"),
            sortField,
            checksum,
            Number(note.source?.flags) || 0,
            text(note.source?.data),
          ])
          .stepReset();
      }
    } finally {
      insertNote.finalize();
    }
    const insertCard = database.prepare(
      "INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    try {
      for (const [index, card] of snapshot.cards.entries()) {
        if (!notes.has(card.noteId)) throw new Error(t("anki_invalid_package"));
        insertCard
          .bind([
            cardMap.get(card.id)!,
            noteMap.get(card.noteId)!,
            deckMap.get(card.deckId)!,
            card.templateOrdinal,
            seconds,
            -1,
            ...scheduleRow(card, created, index + 1),
          ])
          .stepReset();
        report({
          phase: t("anki_export_cards"),
          done: index + 1,
          total: snapshot.cards.length,
        });
      }
    } finally {
      insertCard.finalize();
    }
    const insertReview = database.prepare(
      "INSERT INTO revlog VALUES(?,?,?,?,?,?,?,?,?)",
    );
    try {
      const rawIds = new Set(snapshot.rawReviews.map((review) => review.id));
      for (const review of snapshot.rawReviews) {
        const row = review.data;
        insertReview
          .bind([
            reviewIds(row.id),
            cardMap.get(review.cardId)!,
            -1,
            Number(row.ease),
            Number(row.ivl),
            Number(row.lastIvl),
            Number(row.factor),
            Number(row.time),
            Number(row.type),
          ])
          .stepReset();
      }
      for (const review of snapshot.reviews) {
        if (rawIds.has(review.id)) continue;
        insertReview
          .bind([
            reviewIds(review.time),
            cardMap.get(review.cardId)!,
            ...reviewRow(review),
          ])
          .stepReset();
      }
    } finally {
      insertReview.finalize();
    }
    const deckConfig = {
      "1": {
        id: 1,
        name: "Default",
        mod: seconds,
        usn: -1,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: {
          delays: [1, 10],
          ints: [1, 4],
          initialFactor: 2500,
          order: 1,
          perDay: 20,
          bury: true,
        },
        rev: {
          perDay: 200,
          ease4: 1.3,
          fuzz: 0.05,
          ivlFct: 1,
          maxIvl: 36500,
          bury: true,
          hardFactor: 1.2,
        },
        lapse: {
          delays: [10],
          mult: 0,
          minInt: 1,
          leechFails: 8,
          leechAction: 0,
        },
      },
    };
    database.exec("INSERT INTO col VALUES(1,?,?,?,?,0,-1,0,?,?,?,?,?)", {
      bind: [
        created,
        now,
        now,
        11,
        JSON.stringify({
          nextPos: snapshot.cards.length + 1,
          schedVer: 2,
          activeDecks: Object.keys(decks).map(Number),
          curDeck: Number(deckMap.values().next().value ?? 1),
          newSpread: 0,
          collapseTime: 1200,
          timeLim: 0,
        }),
        stringifyJson(models),
        stringifyJson(decks),
        JSON.stringify(deckConfig),
        "{}",
      ],
    });
    database.exec("COMMIT");
    const bytes = api.capi.sqlite3_js_db_export(database);
    await writer.add("collection.anki2", new Uint8ArrayReader(bytes));
    const mediaMap: Record<string, string> = {};
    let pending: Promise<unknown>[] = [];
    let batchBytes = 0;
    let done = 0;
    for (const [index, [name, { asset, names }]] of [
      ...media.files,
    ].entries()) {
      // Hide per-file storage latency without buffering the whole media collection.
      if (
        pending.length >= 16 ||
        batchBytes + asset.blob.size > 16 * 1024 * 1024
      ) {
        await Promise.all(pending);
        pending = [];
        batchBytes = 0;
      }
      batchBytes += asset.blob.size;
      pending.push(
        (async () => {
          const value =
            names.size && /\.(?:css|js)$/i.test(asset.name)
              ? new Blob([renameReferences(await asset.blob.text(), names)], {
                  type: asset.mime,
                })
              : asset.blob;
          const reader =
            value.size <= 16 * 1024 * 1024
              ? new Uint8ArrayReader(new Uint8Array(await value.arrayBuffer()))
              : new BlobReader(value);
          await writer.add(String(index), reader, {
            level: 0,
            useWebWorkers: false,
          });
          mediaMap[String(index)] = name;
          report({
            phase: t("anki_export_media"),
            done: ++done,
            total: media.files.size,
          });
        })(),
      );
    }
    await Promise.all(pending);
    await writer.add("media", new TextReader(JSON.stringify(mediaMap)));
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  } finally {
    database.close();
  }
}
