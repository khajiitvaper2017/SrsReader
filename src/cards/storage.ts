import { parseHTML } from "linkedom";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { t } from "@/shared/i18n/i18n";
import { emptySchedule } from "@/srs/model";
import { getSettings } from "@/settings/store";
import type { Vocabulary } from "@/vocabulary/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";
import {
  readerNote,
  readerNoteType,
  escapeHtml,
  type CustomField,
} from "@/cards/defaults";
import {
  noteSchema,
  type Card,
  type CardDocument,
  type CardEncounter,
  type Note,
} from "@/cards/model";
import { meaningsForEncounter } from "@/cards/encounter";
import {
  cardEncounterKey,
  cardsForEncounter,
  readingCardIdentity,
  type ReadingCardIdentity,
} from "@/cards/encounter-key";
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

export function noteHeadword(
  note: CardDocument["note"],
  type: CardDocument["noteType"],
) {
  return {
    lemma: fieldText(note.fields[type.bindings.word ?? 0] || "") || type.name,
    reading:
      type.bindings.reading === undefined
        ? ""
        : fieldText(note.fields[type.bindings.reading] || ""),
  };
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

export async function readingCard(
  id: string,
  selectedCardId?: string,
  encounter?: CardEncounter,
) {
  const [word, notes] = await Promise.all([
    db.vocabulary.get(id),
    db.notes.where("wordId").equals(id).toArray(),
  ]);
  if (!notes.length) return;
  const identities = new Map(
    notes.map((note) => [note.id, readingCardIdentity(note, word?.lemma)]),
  );
  const cards = await db.cards
    .where("noteId")
    .anyOf([...identities.keys()])
    .toArray();
  return selectCardForReading(
    cards.map((card) => ({ ...card, ...identities.get(card.noteId) })),
    selectedCardId ?? word?.readingCardId,
    encounter && cardEncounterKey(encounter),
  );
}

export function selectCardForReading<T extends Card & ReadingCardIdentity>(
  cards: T[],
  selectedId?: string,
  encounterKey?: string,
) {
  if (encounterKey === undefined)
    return (
      cards.find((card) => card.id === selectedId) ??
      (cards.length === 1 ? cards[0] : undefined)
    );
  const matches = cardsForEncounter(cards, encounterKey);
  return (
    matches.find((card) => card.id === selectedId) ??
    matches.find((card) => !card.suspended) ??
    matches[0]
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
  encounter?: CardEncounter,
  minedAt?: number,
): Promise<Card> {
  const selected = await readingCard(word.id, undefined, encounter);
  if (selected) return selected;
  if (!encounter && (await getWordCards(word.id)).length)
    throw new Error(t("select_reading_card"));
  const prepared = readerNote(
    word,
    encounter?.context,
    [],
    (await getSettings()).nativeLanguage,
  );
  const now = Date.now();
  if (encounter) {
    prepared.note.id = crypto.randomUUID();
    prepared.note.mediaNamespace = prepared.note.id;
    prepared.note.encounter = encounter;
    prepared.note.created = now;
    prepared.note.updated = now;
  }
  const meanings = applyDefinitionOverrides(word.meanings, word);
  const snapshot = await prepareDictionarySnapshot(
    {
      ...word,
      meanings: encounter
        ? meaningsForEncounter(meanings, encounter)
        : meanings,
    },
    { namespace: prepared.note.mediaNamespace },
  );
  prepared.note.fields[prepared.noteType.bindings.definitions!] = snapshot.html;
  const card: Card = {
    id: prepared.note.id,
    noteId: prepared.note.id,
    templateOrdinal: 0,
    deckId: null,
    minedAt,
    language: word.language,
    schedule: word.known ? null : emptySchedule(now),
    suspended: false,
    leech: false,
    retentionOverride: null,
    srsVersion: 0,
    version: 0,
    created: prepared.note.created,
    updated: prepared.note.updated,
  };
  return db.transaction(
    "rw",
    [db.vocabulary, db.noteTypes, db.notes, db.cards, db.cardAssets],
    async () => {
      const existing = await readingCard(word.id, undefined, encounter);
      if (existing) return existing;
      if (!encounter && (await getWordCards(word.id)).length)
        throw new Error(t("select_reading_card"));
      await db.noteTypes.put(prepared.noteType);
      await db.notes.add(prepared.note);
      if (snapshot.assets.length) await db.cardAssets.bulkPut(snapshot.assets);
      await db.cards.add(card);
      const saved = await db.vocabulary.get(word.id);
      if (!saved?.readingCardId)
        await db.vocabulary.update(word.id, { readingCardId: card.id });
      return card;
    },
  );
}

export async function saveNoteFields(
  noteId: string,
  {
    fields,
    hint,
    reviewAnswer,
  }: Partial<Pick<Note, "fields" | "hint" | "reviewAnswer">>,
) {
  await srsWrite(() =>
    db.transaction("rw", [db.notes, db.noteTypes], async () => {
      const note = await db.notes.get(noteId);
      const noteType = note && (await db.noteTypes.get(note.noteTypeId));
      if (!note || !noteType) throw new Error(t("card_not_found"));
      if (fields && fields.length !== noteType.fields.length)
        throw new Error(t("card_fields_invalid"));
      await db.notes.put({
        ...note,
        fields: fields ?? note.fields,
        hint: hint === undefined ? note.hint : hint.trim() || undefined,
        reviewAnswer:
          reviewAnswer === undefined
            ? note.reviewAnswer
            : noteSchema.shape.reviewAnswer.parse(
                reviewAnswer.trim() || undefined,
              ),
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
  const meanings = applyDefinitionOverrides(word.meanings, word);
  const snapshot = await prepareDictionarySnapshot(
    {
      ...word,
      meanings: note.encounter
        ? meaningsForEncounter(meanings, note.encounter)
        : meanings,
    },
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

export async function saveCustomFields(
  id: string,
  noteId: string,
  fields: CustomField[],
) {
  const note = await db.notes.get(noteId);
  const type = note && (await db.noteTypes.get(note.noteTypeId));
  if (!note || !type || note.wordId !== id)
    throw new Error(t("card_not_found"));
  const document = { note, noteType: type };
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
      const selectedWords = await db.vocabulary
        .where("readingCardId")
        .anyOf(ids)
        .toArray();
      for (const word of selectedWords) {
        const remaining = await getWordCards(word.id);
        await db.vocabulary.update(word.id, {
          readingCardId: remaining[0]?.id,
        });
      }
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
  return db.transaction("rw", [db.cards, db.notes, db.srsMeta], async () => {
    const card = await db.cards.get(id);
    if (!card) throw new Error(t("card_not_found"));
    await db.cards.update(id, {
      suspended: value,
      srsVersion: card.srsVersion + 1,
      version: card.version + 1,
      updated: Date.now(),
    });
    await db.srsMeta.update("main", { undo: undefined });
    return (await db.notes.get(card.noteId))?.wordId;
  });
}
