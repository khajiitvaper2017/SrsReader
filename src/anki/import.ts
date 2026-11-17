import { mediaType } from "@/anki/media";
import { deckTree } from "@/srs/deck-tree";
import { matchesNoteType, mergeNoteType, retainedFields } from "@/anki/merge";
import { recalculateLapses } from "@/srs/lapses";
import Dexie from "dexie";
import { PackageReader, incompatibleNoteTypeIds } from "@/anki/read";
import {
  importOptionsSchema,
  type AnkiModel,
  type AnkiRevlog,
  type AnkiImportOptions,
} from "@/anki/model";
import {
  assetId,
  type AnkiReview,
  type Card,
  type CardAsset,
  type FieldBindings,
  type Note,
  type NoteType,
} from "@/cards/model";
import { readerNote } from "@/cards/defaults";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { getSettings, saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import type { ImportProgress } from "@/shared/download";
import {
  replayHistoricalAnswers,
  type HistoricalAnswer,
} from "@/srs/import-history";
import { emptySchedule } from "@/srs/model";
import { downloadModel, loadModel } from "@/srs/engines/rwkv/assets";
import type { Vocabulary } from "@/vocabulary/model";
import { ankiWord, convertedAnkiNote } from "@/anki/conversion";

async function typeId(model: AnkiModel) {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      model.flds.map((field) => field.name),
      model.tmpls.map((template) => template.name),
      model.type,
      model.css,
      model.tmpls.map((template) => [template.qfmt, template.afmt]),
    ]),
  );
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `anki:type:${model.id}:${Array.from(hash.subarray(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizedHistory(
  reviews: AnkiRevlog[],
  cardId: string,
  language: string,
  sourceId: string,
) {
  const sorted = [...reviews].sort((a, b) => Number(a.id) - Number(b.id));
  const reset = sorted.findLastIndex(
    (review) => review.type === 4 && review.factor === 0,
  );
  const events: HistoricalAnswer[] = sorted
    .slice(reset + 1)
    .filter(
      (review) =>
        review.ease >= 1 &&
        review.ease <= 4 &&
        review.type <= 3 &&
        !(review.type === 3 && review.factor === 0),
    )
    .map((review) => ({
      id: `${sourceId}:review:${review.id}`,
      cardId,
      language,
      time: Number(review.id),
      rating: review.ease as 1 | 2 | 3 | 4,
      durationMs: Math.max(0, review.time),
    }));
  const raw: AnkiReview[] = sorted.map((review) => ({
    id: `${sourceId}:review:${review.id}`,
    cardId,
    sourceId: review.id,
    data: { ...review },
  }));
  return { events, raw };
}

async function mergeConverted(
  notes: Note[],
  cards: Card[],
  types: Map<string, NoteType>,
  words: Map<string, Vocabulary>,
  events: HistoricalAnswer[],
  reviews: AnkiReview[],
  options: AnkiImportOptions,
) {
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    const group = groups.get(note.wordId!) ?? [];
    group.push(note);
    groups.set(note.wordId!, group);
  }
  const mergedNotes: Note[] = [],
    mergedCards: Card[] = [];
  const cardTargets = new Map<string, string>();
  let skipped = 0;
  for (const [id, group] of groups) {
    const previous = await db.notes.get(id);
    if (previous && options.duplicates === "keep") {
      skipped += group.length;
      continue;
    }
    const extras = new Map<string, string[]>();
    for (const note of group) {
      const type = types.get(note.noteTypeId)!;
      for (let index = 10; index < type.fields.length; index++) {
        const field = type.fields[index]!;
        const name = field.label ?? field.name;
        const values = extras.get(name) ?? [];
        if (!values.includes(note.fields[index]!))
          values.push(note.fields[index]!);
        extras.set(name, values);
      }
    }
    const extra = [...extras].map(([name, values]) => ({
      name,
      value: values.filter(Boolean).join("<hr>"),
    }));
    const prepared = readerNote(words.get(id)!, undefined, extra);
    prepared.note.fields = [
      ...group[0]!.fields.slice(0, 10),
      ...extra.map((field) => field.value),
    ];
    const contexts = [
      ...new Set(
        group.map((note) =>
          [note.fields[3], note.fields[5], note.fields[7], note.fields[8]]
            .filter(Boolean)
            .join("<br>"),
        ),
      ),
    ].filter(Boolean);
    if (contexts.length > 1)
      prepared.note.fields[9] = contexts
        .map((context) => `<section>${context}</section>`)
        .join("<hr>");
    const originalNotes = group.map((note) => note.source!);
    const sourceGuids = [
      ...new Set(originalNotes.map((note) => String(note.guid ?? note.id))),
    ];
    const previousGuids = Array.isArray(previous?.source?.importedNotes)
      ? previous.source.importedNotes.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const note = {
      ...group[0]!,
      id,
      noteTypeId: prepared.noteType.id,
      fields: prepared.note.fields,
      importedGenders: [
        ...new Set(group.flatMap((note) => note.importedGenders ?? [])),
      ],
      tags: [...new Set(group.flatMap((note) => note.tags))],
      sourceId: undefined,
      created: previous?.created ?? group[0]!.created,
      version: (previous?.version ?? -1) + 1,
      source: {
        importedNotes: [...new Set([...previousGuids, ...sourceGuids])],
        importedNoteData: originalNotes,
      },
    };
    const noteIds = new Set(group.map((note) => note.id));
    const groupCards = cards.filter((card) => noteIds.has(card.noteId));
    const first = groupCards[0]!;
    const previousCard = await db.cards.get(id);
    const card: Card = {
      ...first,
      id,
      noteId: id,
      templateOrdinal: 0,
      schedule: previousCard?.schedule ?? first.schedule,
      suspended: groupCards.every((card) => card.suspended),
      leech: groupCards.some((card) => card.leech),
      retentionOverride: previousCard?.retentionOverride ?? null,
      srsVersion: previousCard?.srsVersion ?? 0,
      created: previousCard?.created ?? first.created,
      version: (previousCard?.version ?? -1) + 1,
      sourceId: undefined,
      source: { importedCards: groupCards.map((card) => card.source) },
    };
    for (const source of groupCards) cardTargets.set(source.id, id);
    types.set(prepared.noteType.id, prepared.noteType);
    mergedNotes.push(note);
    mergedCards.push(card);
  }
  const retainedEvents = events.filter((event) =>
    cardTargets.has(event.cardId),
  );
  retainedEvents.forEach((event) => {
    event.cardId = cardTargets.get(event.cardId)!;
  });
  const retainedReviews = reviews.filter((review) =>
    cardTargets.has(review.cardId),
  );
  retainedReviews.forEach((review) => {
    review.cardId = cardTargets.get(review.cardId)!;
  });
  notes.length = cards.length = events.length = reviews.length = 0;
  for (const note of mergedNotes) notes.push(note);
  for (const card of mergedCards) cards.push(card);
  for (const event of retainedEvents) events.push(event);
  for (const review of retainedReviews) reviews.push(review);
  return skipped;
}

export async function importPackage(
  file: Blob,
  rawOptions: AnkiImportOptions,
  report: (progress: ImportProgress) => void = () => {},
) {
  const options = importOptionsSchema.parse(rawOptions);
  const reader = new PackageReader(file);
  const namespace = `anki:${crypto.randomUUID()}`;
  let committed = false;
  try {
    report({ phase: t("anki_reading"), done: 0, total: 0 });
    const source = await reader.open((done, total) =>
      report({ phase: t("anki_reading"), done, total }),
    );
    const settings = {
      ...(await getSettings()),
      studyLanguage: options.language,
    };
    const selected = new Set(options.deckIds);
    const sourceCards = source.cards.filter((card) => {
      const id = card.odid !== "0" ? card.odid : card.did;
      return !selected.size || selected.has(id);
    });
    const noteIds = new Set(sourceCards.map((card) => card.nid));
    const sourceNotes = source.notes.filter((note) => noteIds.has(note.id));
    const activeTypes = new Set(
      await db.notes.orderBy("noteTypeId").uniqueKeys(),
    );
    const existingTypes = (await db.noteTypes.toArray()).filter((type) =>
      activeTypes.has(type.id),
    );
    const usedModels = new Set(sourceNotes.map((note) => note.mid));
    const models = new Map(
      source.models
        .filter((model) => usedModels.has(model.id))
        .map((model) => {
          const previous = existingTypes
            .filter((type) => matchesNoteType(model, type))
            .sort(
              (a, b) =>
                b.fields.length +
                b.templates.length -
                (a.fields.length + a.templates.length),
            )[0];
          const merged =
            options.mode === "preserve" && options.mergeNoteTypes && previous
              ? mergeNoteType(model, previous)
              : {
                  model,
                  fieldMap: model.flds.map((_, index) => index),
                  templateMap: model.tmpls.map((_, index) => index),
                };
          return [model.id, { ...merged, id: typeId(merged.model) }] as const;
        }),
    );
    if (options.mode === "preserve" && !options.mergeNoteTypes) {
      const used = new Set(sourceNotes.map((note) => note.mid));
      const incompatible = await incompatibleNoteTypeIds(
        source.models.filter((model) => used.has(model.id)),
      );
      if (incompatible.length)
        throw new Error(
          t("anki_incompatible_note_types", {
            names: source.models
              .filter((model) => incompatible.includes(model.id))
              .map((model) => model.name)
              .join(", "),
          }),
        );
    }
    for (const key of await db.cardAssets.orderBy("namespace").uniqueKeys()) {
      if (
        typeof key === "string" &&
        key.startsWith("anki:") &&
        !(await db.notes.where("mediaNamespace").equals(key).count())
      )
        await db.cardAssets.where("namespace").equals(key).delete();
    }
    const sourceDecks = new Map(source.decks.map((deck) => [deck.id, deck]));
    const sourceHistories = new Map<string, AnkiRevlog[]>();
    for (const review of source.reviews) {
      const records = sourceHistories.get(review.cid) ?? [];
      records.push(review);
      sourceHistories.set(review.cid, records);
    }
    const types = new Map<string, NoteType>();
    const notes: Note[] = [];
    const cards: Card[] = [];
    const words = new Map<string, Vocabulary>();
    const events: HistoricalAnswer[] = [];
    const reviews: AnkiReview[] = [];
    const snapshotAssets: CardAsset[] = [];
    let skipped = 0;
    const now = Date.now();
    const byNote = new Map<string, typeof sourceCards>();
    for (const card of sourceCards) {
      const values = byNote.get(card.nid) ?? [];
      values.push(card);
      byNote.set(card.nid, values);
    }
    for (const [index, original] of sourceNotes.entries()) {
      const plan = models.get(original.mid)!;
      const model = plan.model;
      const incomingBindings = options.bindings[model.id] ?? {};
      for (const value of Object.values(incomingBindings))
        if (value !== undefined && plan.fieldMap[value] === undefined)
          throw new Error(t("anki_invalid_mapping"));
      const bindings: FieldBindings = Object.fromEntries(
        Object.entries(incomingBindings).map(([role, index]) => [
          role,
          index === undefined ? undefined : plan.fieldMap[index],
        ]),
      );
      if (options.mode === "convert" && bindings.word === undefined)
        throw new Error(t("anki_word_field_required", { name: model.name }));
      const id = `anki:note:${original.guid || `${source.created}:${original.id}`}`;
      const previous = await db.notes.get(id);
      if (
        previous &&
        options.duplicates === "keep" &&
        options.mode === "preserve"
      ) {
        skipped++;
        continue;
      }
      const previousType =
        previous &&
        existingTypes.find((type) => type.id === previous.noteTypeId);
      if (
        options.mode === "preserve" &&
        previousType &&
        !matchesNoteType(model, previousType)
      )
        throw new Error(t("anki_unrelated_note_type", { name: model.name }));
      const values =
        previousType && options.mode === "preserve" && options.mergeNoteTypes
          ? retainedFields(previousType, previous!.fields, model)
          : model.flds.map(() => "");
      const incomingValues = original.flds.split("\x1f");
      if (incomingValues.length !== plan.fieldMap.length)
        throw new Error(t("anki_invalid_package"));
      incomingValues.forEach((value, index) => {
        values[plan.fieldMap[index]!] = value;
      });
      const converted = options.mode === "convert";
      const imported = await ankiWord(values, bindings, settings, converted);
      const word = imported?.word;
      if (word) {
        if (converted) word.updated = now;
        words.set(word.id, word);
      }
      let note: Note;
      let noteType: NoteType;
      if (converted) {
        if (!word)
          throw new Error(t("anki_word_field_empty", { name: model.name }));
        const prepared = await convertedAnkiNote(
          word,
          model.flds,
          values,
          bindings,
          namespace,
        );
        note = prepared.note;
        noteType = prepared.noteType;
        snapshotAssets.push(...prepared.assets);
      } else {
        noteType = {
          id: await plan.id,
          name: model.name,
          kind: model.type === 1 ? "cloze" : "standard",
          fields: model.flds.map((field) => ({ name: field.name })),
          templates: model.tmpls.map((template) => ({
            name: template.name,
            front: template.qfmt,
            back: template.afmt,
          })),
          css: model.css,
          bindings,
          created: Number(model.id) || now,
          sourceId: model.id,
          source: model,
        };
        note = {
          id,
          noteTypeId: noteType.id,
          language: options.language,
          fields: values,
          tags: [],
          mediaNamespace: namespace,
          created: now,
          updated: now,
          version: 0,
        };
      }
      const { flds: _fieldText, ...noteMetadata } = original;
      note = {
        ...note,
        id,
        noteTypeId: noteType.id,
        language: options.language,
        tags: original.tags.split(/\s+/).filter(Boolean),
        ...(word ? { wordId: word.id } : {}),
        importedGenders: imported?.gender ? [imported.gender] : undefined,
        mediaNamespace: namespace,
        created: previous?.created ?? (Number(original.id) || now),
        updated: now,
        version: (previous?.version ?? -1) + 1,
        sourceId: original.id,
        source: { ...noteMetadata, collectionCreated: source.created },
      };
      types.set(noteType.id, noteType);
      notes.push(note);
      for (const originalCard of byNote.get(original.id) ?? []) {
        // Conversion retains each source card's independent history with the app template.
        const ordinal =
          options.mode === "preserve" && model.type !== 1
            ? plan.templateMap[originalCard.ord]!
            : originalCard.ord;
        if (ordinal === undefined) throw new Error(t("anki_invalid_package"));
        const cardId = `anki:card:${original.guid || original.id}:${ordinal}`;
        const previousCard = await db.cards.get(cardId);
        const sourceId = `anki:${original.guid || original.id}:${ordinal}`;
        const history = normalizedHistory(
          sourceHistories.get(originalCard.id) ?? [],
          cardId,
          options.language,
          sourceId,
        );
        const did =
          originalCard.odid !== "0" ? originalCard.odid : originalCard.did;
        cards.push({
          id: cardId,
          noteId: id,
          templateOrdinal: options.mode === "convert" ? 0 : ordinal,
          deckId:
            previousCard?.language === options.language
              ? previousCard.deckId
              : `anki:deck:${options.language}:${did}`,
          language: options.language,
          schedule: previousCard?.schedule ?? emptySchedule(now),
          suspended: previousCard?.suspended ?? originalCard.queue === -1,
          leech:
            previousCard?.leech ?? original.tags.split(/\s+/).includes("leech"),
          retentionOverride: previousCard?.retentionOverride ?? null,
          srsVersion: previousCard?.srsVersion ?? 0,
          version: (previousCard?.version ?? -1) + 1,
          created: previousCard?.created ?? (Number(originalCard.id) || now),
          updated: now,
          sourceId: originalCard.id,
          source: {
            ...originalCard,
            flags: previousCard?.source?.flags ?? originalCard.flags,
            deck: sourceDecks.get(did),
            collectionCreated: source.created,
          },
        });
        events.push(...history.events);
        reviews.push(...history.raw);
      }
      report({
        phase: t("anki_import_notes"),
        done: index + 1,
        total: sourceNotes.length,
      });
    }
    if (options.mode === "convert")
      skipped += await mergeConverted(
        notes,
        cards,
        types,
        words,
        events,
        reviews,
        options,
      );
    if (!notes.length) return { notes: 0, cards: 0, skipped };
    const usedTypes = new Set(notes.map((note) => note.noteTypeId));
    const usedWords = new Set(notes.map((note) => note.wordId));
    let assets: CardAsset[] = [],
      batchBytes = 0;
    const flush = async () => {
      if (assets.length) await db.cardAssets.bulkPut(assets);
      assets = [];
      batchBytes = 0;
    };
    for (const [index, media] of reader.media.entries()) {
      const bytes = await reader.bytes(media.entry, reader.compressed);
      if (media.size !== undefined && media.size !== bytes.byteLength)
        throw new Error(t("anki_invalid_package"));
      const mime = mediaType(media.name);
      assets.push({
        id: assetId(namespace, media.name),
        namespace,
        name: media.name,
        mime,
        blob: new Blob([bytes.slice().buffer], { type: mime }),
      });
      batchBytes += bytes.byteLength;
      if (batchBytes >= 16 * 1024 * 1024 || assets.length >= 100) await flush();
      report({
        phase: t("anki_import_media"),
        done: index + 1,
        total: reader.media.length,
      });
    }
    await flush();
    if (snapshotAssets.length) await db.cardAssets.bulkPut(snapshotAssets);
    const oldNamespaces = new Set<string>();
    await srsWrite(async () => {
      // CacheStorage must finish before the atomic IndexedDB publication.
      const model =
        (await getSettings()).algorithm === "rwkv"
          ? (await downloadModel(), await loadModel())
          : undefined;
      await db.transaction(
        "rw",
        db.tables.filter(
          (table) => !["importTasks", "importFiles"].includes(table.name),
        ),
        () =>
          Dexie.waitFor(
            (async () => {
              for (const note of notes) {
                const previous = await db.notes.get(note.id);
                if (previous && previous.mediaNamespace !== namespace)
                  oldNamespaces.add(previous.mediaNamespace);
              }
              if (options.mergeNoteTypes && options.mode === "preserve") {
                const names = new Set(reader.media.map((media) => media.name));
                const related = await db.notes
                  .where("noteTypeId")
                  .anyOf(
                    existingTypes
                      .filter((type) =>
                        [...models.values()].some(({ model }) =>
                          matchesNoteType(model, type),
                        ),
                      )
                      .map((type) => type.id),
                  )
                  .toArray();
                const assetNamespaces = new Set([
                  ...oldNamespaces,
                  ...related.map((note) => note.mediaNamespace),
                ]);
                for (const oldNamespace of assetNamespaces) {
                  const keys = await db.cardAssets
                    .where("[namespace+name]")
                    .between(
                      [oldNamespace, Dexie.minKey],
                      [oldNamespace, Dexie.maxKey],
                    )
                    .keys();
                  const missing = keys.flatMap((key) =>
                    Array.isArray(key) &&
                    typeof key[1] === "string" &&
                    !names.has(key[1])
                      ? [key[1]]
                      : [],
                  );
                  const retained = await db.cardAssets.bulkGet(
                    missing.map((name) => assetId(oldNamespace, name)),
                  );
                  await db.cardAssets.bulkPut(
                    retained.map((asset) => ({
                      ...asset!,
                      id: assetId(namespace, asset!.name),
                      namespace,
                    })),
                  );
                  missing.forEach((name) => names.add(name));
                }
              }
              await db.noteTypes.bulkPut(
                [...types.values()].filter((type) => usedTypes.has(type.id)),
              );
              const vocabulary = [...words.values()].filter((word) =>
                usedWords.has(word.id),
              );
              for (const word of vocabulary) {
                const current = await db.vocabulary.get(word.id);
                if (current)
                  Object.assign(word, current, { meanings: word.meanings });
                if (options.mode === "convert" && !word.readingCardId)
                  word.readingCardId = word.id;
              }
              if (vocabulary.length) await db.vocabulary.bulkPut(vocabulary);
              await db.notes.bulkPut(notes);
              for (const card of cards) {
                const current = await db.cards.get(card.id);
                if (current) {
                  card.version = current.version + 1;
                  card.srsVersion = current.srsVersion;
                  card.schedule = current.schedule;
                  card.retentionOverride = current.retentionOverride;
                  card.suspended = current.suspended;
                  card.leech = current.leech;
                  if (current.language === card.language)
                    card.deckId = current.deckId;
                  if (card.source && current.source?.flags !== undefined)
                    card.source.flags = current.source.flags;
                }
              }
              const language = options.language;
              const prefix = `anki:deck:${language}:`;
              const deckIds = new Set(
                cards.flatMap((card) =>
                  card.deckId?.startsWith(prefix) ? [card.deckId] : [],
                ),
              );
              const savedDecks = await db.decks
                .where("language")
                .equals(language)
                .toArray();
              const savedIds = new Set(savedDecks.map((deck) => deck.id));
              const savedNodes = deckTree(savedDecks);
              const byId = new Map(savedNodes.map((node) => [node.id, node]));
              const byName = new Map(
                savedNodes.map((node) => [node.name, node]),
              );
              const bySourceName = new Map(
                source.decks.map((deck) => [deck.name, deck]),
              );
              const targets = new Map<string, { id: string; name: string }>();
              const incoming = [...deckIds].map((id) => ({
                id,
                name:
                  sourceDecks.get(id.slice(prefix.length))?.name ??
                  byId.get(id)?.name ??
                  "Default",
                language,
                created: now,
              }));
              for (const node of deckTree(incoming)) {
                const sourceDeck = bySourceName.get(node.name);
                const sourceId = node.id.startsWith(prefix)
                  ? node.id
                  : sourceDeck && prefix + sourceDeck.id;
                const parent = node.parentId && targets.get(node.parentId);
                const path = parent
                  ? `${parent.name}::${node.label}`
                  : node.label;
                const existing =
                  (sourceId && byId.get(sourceId)) || byName.get(path);
                const id = existing?.id ?? sourceId ?? crypto.randomUUID();
                const name = existing?.name ?? path;
                if (!savedIds.has(id)) {
                  await db.decks.put({
                    id,
                    language,
                    name: existing?.label ?? node.label,
                    parentId: existing
                      ? existing.parentId
                      : parent
                        ? parent.id
                        : null,
                    legacyPath: existing?.legacyPath,
                    created: now,
                  });
                  savedIds.add(id);
                }
                targets.set(node.id, { id, name });
              }
              for (const card of cards) {
                const target = card.deckId && targets.get(card.deckId);
                if (target) card.deckId = target.id;
              }
              await db.cards.bulkPut(cards);
              if (reviews.length) await db.ankiReviews.bulkPut(reviews);
              const eligible = new Set(events.map((event) => event.id));
              for (const review of reviews) {
                if (
                  !eligible.has(review.id) &&
                  (await db.reviews.get(review.id))
                )
                  await db.reviews.update(review.id, { active: false });
              }
              const reportHistory = (done: number, total: number) =>
                Dexie.ignoreTransaction(() =>
                  report({ phase: t("anki_import_history"), done, total }),
                );
              const currentSettings = await getSettings();
              if (!currentSettings.studyLanguages.includes(options.language))
                await saveSettings({
                  ...currentSettings,
                  studyLanguages: [
                    ...currentSettings.studyLanguages,
                    options.language,
                  ],
                });
              reportHistory(0, events.length);
              if (events.length)
                await replayHistoricalAnswers(
                  events,
                  cards.map((card) => card.id),
                  reportHistory,
                  model,
                );
              await recalculateLapses(cards.map((card) => card.id));
              reportHistory(events.length, events.length);
            })(),
            2_147_483_647,
          ),
      );
      committed = true;
    });
    for (const oldNamespace of oldNamespaces)
      if (
        !(await db.notes.where("mediaNamespace").equals(oldNamespace).count())
      )
        await db.cardAssets.where("namespace").equals(oldNamespace).delete();
    return { notes: notes.length, cards: cards.length, skipped };
  } finally {
    await reader.close();
    if (!committed)
      await db.cardAssets.where("namespace").equals(namespace).delete();
  }
}
