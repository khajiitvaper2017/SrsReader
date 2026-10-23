import type { LookupWord, Meaning } from "@/dictionaries/model";
import { definitionSenses } from "@/dictionaries/definitions";
import { t } from "@/shared/i18n/i18n";
import { db } from "@/platform/database/db";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { emptySchedule } from "@/srs/model";
import type { Request } from "@/vocabulary/contracts";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";
import { cacheContext } from "@/examples/sentences";
import { sentenceId } from "@/examples/sentence-model";
import { applyDefinitionOverrides, meaningKey } from "@/vocabulary/definitions";

export async function mine(word: LookupWord, context?: ReadingContext) {
  await cacheContext(word, context);
  return db.transaction("rw", db.vocabulary, async () => {
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    saved.mined = true;
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
  request: Extract<Request, { action: "defineWord" }>,
  tags?: Pick<Meaning, "tags" | "tagDescriptions">,
) {
  return db.transaction("rw", [db.vocabulary, db.sentences], async () => {
    const existing = await db.vocabulary.get(word.id);
    const saved = existing || (await mine(word, request.context));
    if (existing) {
      await cacheContext(word, request.context);
      saved.version++;
      saved.updated = Date.now();
    }
    const definitions = definitionSenses(request.definition);
    if (request.dictionaryKey !== undefined) {
      const meaning = word.meanings.find(
        (meaning) =>
          meaning.dictionaryId !== "personal" &&
          meaningKey(meaning) === request.dictionaryKey,
      );
      if (!meaning) throw new Error(t("definition_not_found"));
      if (
        !saved.meanings.some(
          (entry) => meaningKey(entry) === request.dictionaryKey,
        )
      )
        saved.meanings.push(meaning);
      saved.definitionOverrides = {
        ...saved.definitionOverrides,
        [request.dictionaryKey]: definitions,
      };
      await db.vocabulary.put(saved);
      return saved;
    }
    const personal = saved.meanings.filter(
      (meaning) => meaning.dictionaryId === "personal",
    );
    if (request.definitionIndex === undefined) {
      personal.push({
        dictionaryId: "personal",
        title: "",
        revision: "",
        attribution: "",
        sourceUrl: "",
        tags: "",
        ...tags,
        definitions,
      });
    } else {
      const meaning = personal[request.definitionIndex];
      if (!meaning) throw new Error(t("definition_not_found"));
      if (tags) Object.assign(meaning, tags);
      meaning.definitions = definitions;
    }
    saved.meanings = [
      ...personal,
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
      word.meanings = [
        ...word.meanings.filter(
          (meaning) => meaning.dictionaryId === "personal",
        ),
        ...applyDefinitionOverrides(meanings, word).map(
          ({ customDefinitions: _custom, ...meaning }) => meaning,
        ),
      ];
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
  const word = await db.vocabulary.get(request.id);
  if (word)
    await db.sentences.update(sentenceId(word.language, request.sentence), {
      translation: request.translation,
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
      let index = 0;
      word.meanings = word.meanings.filter(
        (meaning) =>
          meaning.dictionaryId !== "personal" ||
          index++ !== request.definitionIndex,
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
  return deleteWords([request.id]);
}

export async function deleteWords(ids: string[]) {
  if (!ids.length) return;
  const removed = new Set(ids);
  await db.transaction(
    "rw",
    [
      db.vocabulary,
      db.decks,
      db.reviews,
      db.audio,
      db.rwkvMeta,
      db.rwkvEntities,
      db.rwkvCards,
      db.srsMeta,
    ],
    async () => {
      await db.vocabulary.bulkDelete(ids);
      await db.decks.toCollection().modify((deck) => {
        deck.wordIds = deck.wordIds.filter((id) => !removed.has(id));
      });
      await db.reviews.where("wordId").anyOf(ids).delete();
      await db.audio.bulkDelete(ids);
      await invalidateRwkv();
      await db.srsMeta.update("main", { undo: undefined });
    },
  );
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
