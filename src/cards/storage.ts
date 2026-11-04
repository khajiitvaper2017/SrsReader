import { parseHTML } from "linkedom";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { t } from "@/shared/i18n/i18n";
import { emptySchedule } from "@/srs/model";
import { getSettings } from "@/settings/store";
import {
  wordId,
  vocabularySchema,
  type ReadingContext,
  type Vocabulary,
} from "@/vocabulary/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";
import {
  readerNote,
  readerNoteType,
  escapeHtml,
  type CustomField,
} from "@/cards/defaults";
import type { Card, CardDocument } from "@/cards/model";
import { prepareDictionarySnapshot } from "@/cards/snapshot";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";

export function fieldText(value: string, trim = true) {
  const { document } = parseHTML(
    `<html><body>${value.replace(/<br\s*\/?>/gi, "\n")}</body></html>`,
  );
  document
    .querySelectorAll("script,style,rt,rp")
    .forEach((element) => element.remove());
  const text = document.body.textContent ?? "";
  return trim ? text.trim() : text;
}

export async function getCardDocument(
  id: string,
): Promise<CardDocument | undefined> {
  const card = await db.cards.get(id);
  const note = card && (await db.notes.get(card.noteId));
  const noteType = note && (await db.noteTypes.get(note.noteTypeId));
  return card && note && noteType ? { card, note, noteType } : undefined;
}

async function getWordCards(id: string) {
  const notes = await db.notes.where("wordId").equals(id).primaryKeys();
  return notes.length ? db.cards.where("noteId").anyOf(notes).toArray() : [];
}

export async function readingCard(id: string, selectedCardId?: string) {
  const [word, cards] = await Promise.all([
    db.vocabulary.get(id),
    getWordCards(id),
  ]);
  return (
    cards.find((card) => card.id === (selectedCardId ?? word?.readingCardId)) ??
    (cards.length === 1 ? cards[0] : undefined)
  );
}

export async function selectReadingCard(id: string, cardId: string) {
  const cards = await getWordCards(id);
  if (!cards.some((card) => card.id === cardId))
    throw new Error(t("card_not_found"));
  await db.vocabulary.update(id, { readingCardId: cardId });
}

export async function ensureReaderCard(
  word: Vocabulary,
  context?: ReadingContext,
): Promise<Card> {
  const selected = await readingCard(word.id);
  if (selected) return selected;
  if ((await getWordCards(word.id)).length)
    throw new Error(t("select_reading_card"));
  const prepared = readerNote(
    word,
    context,
    [],
    (await getSettings()).nativeLanguage,
  );
  const snapshot = await prepareDictionarySnapshot(
    { ...word, meanings: applyDefinitionOverrides(word.meanings, word) },
    { namespace: prepared.note.mediaNamespace },
  );
  prepared.note.fields[prepared.noteType.bindings.definitions!] = snapshot.html;
  const card: Card = {
    id: word.id,
    noteId: prepared.note.id,
    templateOrdinal: 0,
    deckId: null,
    language: word.language,
    schedule: word.known ? null : emptySchedule(),
    suspended: false,
    leech: false,
    retentionOverride: null,
    srsVersion: 0,
    version: 0,
    created: word.created,
    updated: word.updated,
  };
  await db.transaction(
    "rw",
    [db.vocabulary, db.noteTypes, db.notes, db.cards, db.cardAssets],
    async () => {
      // Mining can race another tab; keep the card already created for this word.
      if ((await getWordCards(word.id)).length) return;
      await db.noteTypes.put(prepared.noteType);
      await db.notes.put(prepared.note);
      if (snapshot.assets.length) await db.cardAssets.bulkPut(snapshot.assets);
      await db.cards.add(card);
      await db.vocabulary.update(word.id, { readingCardId: card.id });
    },
  );
  return (await readingCard(word.id))!;
}

export async function saveNoteFields(noteId: string, fields: string[]) {
  await srsWrite(() =>
    db.transaction("rw", [db.notes, db.noteTypes, db.vocabulary], async () => {
      const note = await db.notes.get(noteId);
      const noteType = note && (await db.noteTypes.get(note.noteTypeId));
      if (!note || !noteType) throw new Error(t("card_not_found"));
      if (fields.length !== noteType.fields.length)
        throw new Error(t("card_fields_invalid"));
      const wordIndex = noteType.bindings.word;
      if (wordIndex !== undefined) {
        const lemma = fieldText(fields[wordIndex]!);
        const reading =
          noteType.bindings.reading === undefined
            ? ""
            : fieldText(fields[noteType.bindings.reading]!);
        if (lemma) {
          const id = wordId(note.language, lemma, reading);
          if (!(await db.vocabulary.get(id)))
            await db.vocabulary.put(
              vocabularySchema.parse({
                id,
                language: note.language,
                lemma,
                reading,
                meanings: [],
                known: false,
                mined: true,
                version: 0,
                created: Date.now(),
                updated: Date.now(),
              }),
            );
          note.wordId = id;
        } else delete note.wordId;
      }
      await db.notes.put({
        ...note,
        fields,
        version: note.version + 1,
        updated: Date.now(),
      });
    }),
  );
}

export async function refreshDictionaryFields(id: string, noteId?: string) {
  const word = await db.vocabulary.get(id);
  if (!word) throw new Error(t("word_not_found"));
  const card = noteId ? undefined : await readingCard(id);
  const note = await db.notes.get(noteId ?? card?.noteId ?? "");
  const type = note && (await db.noteTypes.get(note.noteTypeId));
  if (!note || !type) throw new Error(t("select_reading_card"));
  if (type.bindings.definitions === undefined)
    throw new Error(t("card_dictionary_field_missing"));
  const snapshot = await prepareDictionarySnapshot(
    { ...word, meanings: applyDefinitionOverrides(word.meanings, word) },
    { namespace: note.mediaNamespace },
  );
  const fields = [...note.fields];
  fields[type.bindings.definitions] = snapshot.html;
  await db.transaction("rw", [db.notes, db.cardAssets], async () => {
    if (snapshot.assets.length) await db.cardAssets.bulkPut(snapshot.assets);
    await db.notes.update(note.id, {
      fields,
      version: note.version + 1,
      updated: Date.now(),
    });
  });
}

export async function refreshNote(noteId: string) {
  const note = await db.notes.get(noteId);
  if (!note?.wordId) throw new Error(t("card_dictionary_field_missing"));
  const { vocabularyClient } = await import("@/vocabulary/client");
  await vocabularyClient({ action: "refreshWord", id: note.wordId, noteId });
}

export async function saveCustomFields(id: string, fields: CustomField[]) {
  const card = await readingCard(id);
  const document = card && (await getCardDocument(card.id));
  if (!document) throw new Error(t("select_reading_card"));
  if (!document.noteType.id.startsWith("reader:"))
    throw new Error(t("card_field_schema_fixed"));
  const noteType = readerNoteType(fields);
  await db.transaction("rw", [db.noteTypes, db.notes], async () => {
    await db.noteTypes.put(noteType);
    await db.notes.update(document.note.id, {
      noteTypeId: noteType.id,
      fields: [
        ...document.note.fields.slice(0, 10),
        ...fields.map((field) =>
          escapeHtml(field.value).replace(/\n/g, "<br>"),
        ),
      ],
      version: document.note.version + 1,
      updated: Date.now(),
    });
  });
}

export async function deleteCards(ids: string[]) {
  if (!ids.length) return;
  await db.transaction(
    "rw",
    [
      db.cards,
      db.notes,
      db.noteTypes,
      db.cardAssets,
      db.vocabulary,
      db.audio,
      db.srsMeta,
      db.rwkvCards,
      db.rwkvEntities,
      db.rwkvMeta,
    ],
    async () => {
      const cards = (await db.cards.bulkGet(ids)).filter(
        (card) => card !== undefined,
      );
      await db.cards.bulkDelete(ids);
      await db.vocabulary
        .where("readingCardId")
        .anyOf(ids)
        .modify((word) => {
          delete word.readingCardId;
        });
      for (const noteId of new Set(cards.map((card) => card.noteId))) {
        if (await db.cards.where("noteId").equals(noteId).count()) continue;
        const note = await db.notes.get(noteId);
        if (!note) continue;
        await db.notes.delete(note.id);
        if (
          note.wordId &&
          !(await db.notes.where("wordId").equals(note.wordId).count())
        ) {
          await db.vocabulary.delete(note.wordId);
          await db.audio.delete(note.wordId);
        }
        if (
          !(await db.notes.where("noteTypeId").equals(note.noteTypeId).count())
        )
          await db.noteTypes.delete(note.noteTypeId);
        if (
          !(await db.notes
            .where("mediaNamespace")
            .equals(note.mediaNamespace)
            .count())
        )
          await db.cardAssets
            .where("namespace")
            .equals(note.mediaNamespace)
            .delete();
      }
      await invalidateRwkv();
      await db.srsMeta.update("main", { undo: undefined });
    },
  );
}

export async function setCardSuspended(id: string, value: boolean) {
  await srsWrite(() =>
    db.transaction("rw", [db.cards, db.srsMeta], async () => {
      await db.cards
        .where("id")
        .equals(id)
        .modify((card) => {
          card.suspended = value;
          card.srsVersion++;
          card.version++;
          card.updated = Date.now();
        });
      await db.srsMeta.update("main", { undo: undefined });
    }),
  );
}
