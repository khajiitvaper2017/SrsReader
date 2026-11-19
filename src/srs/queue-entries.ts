import Dexie from "dexie";
import { noteHeadword } from "@/cards/storage";
import { db } from "@/platform/database/db";
import type { Vocabulary } from "@/vocabulary/model";

type QueueWord = Pick<Vocabulary, "lemma" | "reading" | "known">;
async function readMetadata(language: string) {
  return db.transaction(
    "r",
    [db.vocabulary, db.notes, db.noteTypes],
    async () => {
      const words = new Map<string, QueueWord>();
      await db.vocabulary
        .where("language")
        .equals(language)
        .each(({ id, lemma, reading, known }) => {
          words.set(id, { lemma, reading, known });
        });
      const types = new Map(
        (await db.noteTypes.toArray()).map((type) => [type.id, type]),
      );
      const notes = new Map<string, QueueWord & { wordId?: string }>();
      await db.notes
        .where("language")
        .equals(language)
        .each((note) => {
          const type = types.get(note.noteTypeId);
          if (!type) return;
          const saved = note.wordId && words.get(note.wordId);
          notes.set(
            note.id,
            saved
              ? { ...saved, wordId: note.wordId }
              : {
                  wordId: note.wordId,
                  ...noteHeadword(note, type),
                  known: false,
                },
          );
        });
      return {
        notes,
        total: words.size,
        known: [...words.values()].filter((word) => word.known).length,
      };
    },
  );
}

const metadata = new Map<string, ReturnType<typeof readMetadata>>();
Dexie.on("storagemutated", (changes) => {
  if (
    ["vocabulary", "notes", "noteTypes"].some((table) =>
      Object.keys(changes).some((key) =>
        key.startsWith(`idb://${db.name}/${table}/`),
      ),
    )
  )
    metadata.clear();
});
export function queueMetadata(language: string) {
  const cached = metadata.get(language);
  if (cached) return cached;
  const result = readMetadata(language);
  metadata.set(language, result);
  void result.catch(() => {
    if (metadata.get(language) === result) metadata.delete(language);
  });
  return result;
}
export async function queueEntries(language: string, deckIds?: string[]) {
  const [{ notes }, cards] = await Promise.all([
    queueMetadata(language),
    deckIds
      ? db.cards.where("deckId").anyOf(deckIds).toArray()
      : db.cards.where("language").equals(language).toArray(),
  ]);
  return cards.flatMap((card) => {
    const note = notes.get(card.noteId);
    return note
      ? [
          {
            ...note,
            id: card.id,
            noteId: card.noteId,
            deckId: card.deckId,
            language,
            created: card.created,
            card: card.schedule,
            suspended: card.suspended,
            buriedUntil: card.buriedUntil,
          },
        ]
      : [];
  });
}
export type QueueEntry = Awaited<ReturnType<typeof queueEntries>>[number];
