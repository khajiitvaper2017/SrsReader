import type { Card, Note, NoteType } from "@/cards/model";
import { t } from "@/shared/i18n/i18n";

export function validateCardReferences(
  types: NoteType[],
  notes: Note[],
  cards: Card[],
  decks: { id: string; language: string }[],
  words: { id: string; language: string }[],
) {
  const byType = new Map(types.map((type) => [type.id, type]));
  const byNote = new Map(notes.map((note) => [note.id, note]));
  const byDeck = new Map(decks.map((deck) => [deck.id, deck]));
  const byWord = new Map(words.map((word) => [word.id, word]));
  if (
    byType.size !== types.length ||
    byNote.size !== notes.length ||
    new Set(cards.map((card) => card.id)).size !== cards.length ||
    byDeck.size !== decks.length
  )
    throw new Error(t("card_references_invalid"));
  for (const type of types) {
    if (
      new Set(type.fields.map((field) => field.name)).size !==
        type.fields.length ||
      Object.values(type.bindings).some(
        (index) => index !== undefined && index >= type.fields.length,
      )
    )
      throw new Error(t("card_fields_invalid"));
  }
  for (const note of notes) {
    const type = byType.get(note.noteTypeId);
    if (
      !type ||
      note.fields.length !== type.fields.length ||
      (note.wordId && byWord.get(note.wordId)?.language !== note.language)
    )
      throw new Error(t("card_references_invalid"));
  }
  for (const card of cards) {
    const note = byNote.get(card.noteId);
    const type = note && byType.get(note.noteTypeId);
    if (
      !note ||
      !type ||
      note.language !== card.language ||
      (type.kind === "standard" &&
        card.templateOrdinal >= type.templates.length) ||
      (card.deckId && byDeck.get(card.deckId)?.language !== card.language)
    )
      throw new Error(t("card_references_invalid"));
  }
}
