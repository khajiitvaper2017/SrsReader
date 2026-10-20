import type { LookupWord } from "@/dictionaries/model";
import { db } from "@/platform/database/db";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { emptySchedule } from "@/srs/model";
import type { Request } from "@/vocabulary/contracts";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { addContext, freshWord } from "@/vocabulary/service";

export async function mine(word: LookupWord, context?: ReadingContext) {
  return db.transaction("rw", db.vocabulary, async () => {
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    addContext(saved, context);
    if (!saved.card && !saved.known) {
      saved.card = emptySchedule();
      saved.srsVersion++;
    }
    saved.updated = Date.now();
    saved.version++;
    await db.vocabulary.put(saved);
    return saved;
  });
}

export function definePersonalWord(
  word: LookupWord,
  definition: string,
  context?: ReadingContext,
) {
  return db.transaction("rw", db.vocabulary, async () => {
    const saved = await mine(word, context);
    saved.meanings = [
      {
        dictionaryId: "personal",
        title: "",
        revision: "",
        attribution: "",
        sourceUrl: "",
        tags: "",
        definitions: [definition],
      },
      ...saved.meanings.filter(
        (meaning) => meaning.dictionaryId !== "personal",
      ),
    ];
    await db.vocabulary.put(saved);
    return saved;
  });
}

export function replaceMeanings(id: string, meanings: Vocabulary["meanings"]) {
  return db.vocabulary
    .where("id")
    .equals(id)
    .modify((word) => {
      word.meanings = meanings;
      word.version++;
      word.updated = Date.now();
    });
}

export async function setMastered(word: LookupWord, value: boolean) {
  return db.transaction("rw", db.vocabulary, async () => {
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    saved.known = value;
    saved.suspended = false;
    if (!value && !saved.card) saved.card = emptySchedule();
    saved.updated = Date.now();
    saved.version++;
    saved.srsVersion++;
    await db.vocabulary.put(saved);
    return saved;
  });
}

export async function saveTranslation(
  request: Extract<Request, { action: "saveTranslation" }>,
) {
  await db.vocabulary
    .where("id")
    .equals(request.id)
    .modify((word) => {
      const context = word.contexts.find(
        (c) => c.sentence === request.sentence && c.start === request.start,
      );
      if (!context) return;
      context.translation = request.translation;
      word.version++;
      word.updated = Date.now();
    });
  return;
}
export async function deleteDefinition(
  request: Extract<Request, { action: "deleteDefinition" }>,
) {
  await db.vocabulary
    .where("id")
    .equals(request.id)
    .modify((word) => {
      word.meanings = word.meanings.filter(
        (meaning) => meaning.dictionaryId !== "personal",
      );
      word.version++;
      word.updated = Date.now();
    });
  return;
}
export async function setSuspended(
  request: Extract<Request, { action: "suspend" }>,
) {
  await db.vocabulary
    .where("id")
    .equals(request.id)
    .modify((w) => {
      w.suspended = request.value;
      w.srsVersion++;
      w.version++;
      w.updated = Date.now();
    });
  return;
}
export async function deleteWord(
  request: Extract<Request, { action: "deleteWord" }>,
) {
  await db.transaction(
    "rw",
    [
      db.vocabulary,
      db.reviews,
      db.audio,
      db.rwkvMeta,
      db.rwkvEntities,
      db.rwkvCards,
      db.srsMeta,
    ],
    async () => {
      await db.vocabulary.delete(request.id);
      await db.reviews.where("wordId").equals(request.id).delete();
      await db.audio.delete(request.id);
      await invalidateRwkv();
      await db.srsMeta.update("main", { undo: undefined });
    },
  );
  return;
}
export async function editWord(
  request: Extract<Request, { action: "editWord" }>,
) {
  await db.vocabulary
    .where("id")
    .equals(request.id)
    .modify((w) => {
      if (request.definition)
        w.meanings = [
          {
            dictionaryId: "personal",
            title: "",
            revision: "",
            attribution: "",
            sourceUrl: "",
            tags: "",
            definitions: [request.definition],
          },
        ];
      w.contexts = request.contexts;
      w.version++;
      w.updated = Date.now();
    });
  return;
}
export async function setRetentionOverride(
  request: Extract<Request, { action: "retentionOverride" }>,
) {
  await db.vocabulary
    .where("id")
    .equals(request.id)
    .modify((word) => {
      word.retentionOverride = request.value;
      word.srsVersion++;
      word.version++;
      word.updated = Date.now();
    });
  return;
}

export const getWord = (id: string) => db.vocabulary.get(id);
export const getWords = (ids: string[]) => db.vocabulary.bulkGet(ids);
export const languageWords = (language: string) =>
  db.vocabulary.where("language").equals(language).toArray();
