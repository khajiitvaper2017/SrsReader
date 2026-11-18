import type { LookupWord, Meaning } from "@/dictionaries/model";
import type { Card, CardDocument, CardEncounter } from "@/cards/model";
import { resolveCardEncounter } from "@/cards/encounter";
import { cardEncounterKey, readingCardIdentity } from "@/cards/encounter-key";
import {
  deleteCards,
  ensureReaderCard,
  fieldText,
  getCardDocument,
  readingCard,
  refreshDictionaryFields,
  saveCustomFields,
  selectCardForReading,
} from "@/cards/storage";
import { escapeHtml } from "@/cards/defaults";
import { definitionSenses } from "@/dictionaries/definitions";
import { t } from "@/shared/i18n/i18n";
import { db } from "@/platform/database/db";
import { emptySchedule } from "@/srs/model";
import type { Request } from "@/vocabulary/contracts";
import type { ReviewWord, Vocabulary, WordWithCards } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";
import { cacheContext } from "@/examples/sentences";
import { sentenceId } from "@/examples/sentence-model";
import { applyDefinitionOverrides, meaningKey } from "@/vocabulary/definitions";

export const wordWriteTables = () => [
  db.vocabulary,
  db.notes,
  db.noteTypes,
  db.cards,
  db.cardAssets,
  db.dictionaries,
  db.dictionaryMedia,
  db.sentences,
  db.settings,
];

function extraFields(document?: CardDocument) {
  if (!document) return [];
  const bound = new Set(Object.values(document.noteType.bindings));
  return document.noteType.fields.flatMap((field, index) => {
    if (
      bound.has(index) ||
      (document.noteType.id.startsWith("reader:") && index < 10)
    )
      return [];
    const html = (document.note.fields[index] || "").replace(
      /<\/(?:div|p|li|tr|h[1-6]|section|blockquote)\s*>/gi,
      "$&\n",
    );
    const value = fieldText(html, false)
      .trim()
      .replace(/\n{3,}/g, "\n\n");
    return value ? [{ name: field.label || field.name, value }] : [];
  });
}

async function projectWords(
  words: (Vocabulary | undefined)[],
  includeContent = false,
  encounter?: CardEncounter,
) {
  const ids = words.flatMap((word) => (word ? [word.id] : []));
  if (!ids.length) return words.map(() => undefined);
  const notes = await db.notes.where("wordId").anyOf(ids).toArray();
  const cards = notes.length
    ? await db.cards
        .where("noteId")
        .anyOf(notes.map((note) => note.id))
        .toArray()
    : [];
  const loadedTypes = includeContent
    ? await db.noteTypes.bulkGet([
        ...new Set(notes.map((note) => note.noteTypeId)),
      ])
    : [];
  const types = new Map(
    loadedTypes.flatMap((type) => (type ? [[type.id, type] as const] : [])),
  );
  const byWord = new Map<string, WordWithCards["linkedCards"]>();
  const lemmas = new Map(
    words.flatMap((word) => (word ? [[word.id, word.lemma] as const] : [])),
  );
  const byNote = new Map(notes.map((note) => [note.id, note]));
  for (const card of cards) {
    const note = byNote.get(card.noteId)!;
    const wordId = note.wordId!;
    const entries = byWord.get(wordId) || [];
    entries.push({
      ...card,
      ...readingCardIdentity(note, lemmas.get(wordId)),
    });
    byWord.set(wordId, entries);
  }
  const encounterKey = encounter && cardEncounterKey(encounter);
  return words.map((word): WordWithCards | undefined => {
    if (!word) return undefined;
    const linkedCards = byWord.get(word.id) || [];
    const selected = selectCardForReading(
      linkedCards,
      word.readingCardId,
      encounterKey,
    );
    const note = selected && byNote.get(selected.noteId);
    const noteType = note && types.get(note.noteTypeId);
    return {
      ...word,
      linkedCards,
      encounterKey,
      cardId: selected?.id,
      card: selected?.schedule || null,
      srsVersion: selected?.srsVersion || 0,
      suspended: encounter
        ? !!selected?.suspended
        : linkedCards.length > 0 && linkedCards.every((card) => card.suspended),
      leech: linkedCards.some((card) => card.leech),
      retentionOverride: selected?.retentionOverride ?? null,
      customFields: includeContent
        ? extraFields(
            selected && note && noteType
              ? { card: selected, note, noteType }
              : undefined,
          )
        : [],
    };
  });
}

export async function getWord(id: string, encounter?: CardEncounter) {
  return (
    await projectWords([await db.vocabulary.get(id)], true, encounter)
  )[0];
}
export async function getWords(ids: string[]) {
  return projectWords(await db.vocabulary.bulkGet(ids));
}
export async function languageWords(language: string) {
  return (
    await projectWords(
      await db.vocabulary.where("language").equals(language).toArray(),
    )
  ).filter((word): word is WordWithCards => !!word);
}
export async function reviewCards(cards: Card[]): Promise<ReviewWord[]> {
  if (!cards.length) return [];
  const notes = new Map(
    (
      await db.notes.bulkGet([...new Set(cards.map((card) => card.noteId))])
    ).flatMap((note) => (note ? [[note.id, note] as const] : [])),
  );
  const types = new Map(
    (
      await db.noteTypes.bulkGet([
        ...new Set([...notes.values()].map((note) => note.noteTypeId)),
      ])
    ).flatMap((type) => (type ? [[type.id, type] as const] : [])),
  );
  const wordIds = [
    ...new Set(
      [...notes.values()].flatMap((note) => (note.wordId ? [note.wordId] : [])),
    ),
  ];
  const words = new Map(
    (await db.vocabulary.bulkGet(wordIds)).flatMap((word) =>
      word ? [[word.id, word] as const] : [],
    ),
  );
  return cards.flatMap((card) => {
    const note = notes.get(card.noteId);
    const noteType = note && types.get(note.noteTypeId);
    if (!note || !noteType) return [];
    const document = { card, note, noteType };
    const saved =
      (note.wordId ? words.get(note.wordId) : undefined) ||
      freshWord({
        id: card.id,
        language: note.language,
        lemma:
          fieldText(note.fields[noteType.bindings.word ?? 0] || "") ||
          noteType.name,
        reading:
          noteType.bindings.reading === undefined
            ? ""
            : fieldText(note.fields[noteType.bindings.reading] || ""),
        meanings: [],
        forms: [],
      });
    return [
      {
        ...saved,
        id: card.id,
        wordId: note.wordId,
        noteId: note.id,
        document,
        cardId: card.id,
        card: card.schedule,
        srsVersion: card.srsVersion,
        suspended: card.suspended,
        leech: card.leech,
        retentionOverride: card.retentionOverride,
        linkedCards: [card],
        customFields: [],
        created: card.created,
        updated: card.updated,
      },
    ];
  });
}
export async function reviewCard(id: string) {
  const card = await db.cards.get(id);
  return card ? (await reviewCards([card]))[0] : undefined;
}
export async function allReviewCards(language?: string) {
  const cards = language
    ? await db.cards.where("language").equals(language).toArray()
    : await db.cards.toArray();
  return reviewCards(cards);
}

async function updateSavedFields(id: string) {
  const word = await getWord(id);
  if (
    word?.cardId &&
    (await getCardDocument(word.cardId))?.noteType.bindings.definitions !==
      undefined
  )
    await refreshDictionaryFields(id);
}

export async function mine(word: LookupWord, encounter?: CardEncounter) {
  return db.transaction("rw", wordWriteTables(), async () => {
    await cacheContext(word, encounter?.context);
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    saved.meanings = [
      ...new Map(
        [...saved.meanings, ...word.meanings].map((meaning) => [
          meaningKey(meaning),
          meaning,
        ]),
      ).values(),
    ];
    saved.mined = true;
    saved.updated = Date.now();
    saved.version++;
    await db.vocabulary.put(saved);
    const card = await ensureReaderCard(saved, encounter);
    if (!card.schedule && !saved.known)
      await db.cards.update(card.id, {
        schedule: emptySchedule(),
        srsVersion: card.srsVersion + 1,
        version: card.version + 1,
        updated: Date.now(),
      });
    return (await getWord(saved.id, encounter))!;
  });
}

export async function definePersonalWord(
  word: LookupWord,
  request: Extract<Request, { action: "defineWord" }>,
  tags?: Pick<Meaning, "tags" | "tagDescriptions">,
) {
  const encounter = await resolveCardEncounter(
    request.context,
    request.occurrence,
  );
  return db.transaction("rw", wordWriteTables(), async () => {
    let saved = await db.vocabulary.get(word.id);
    if (!saved) {
      await mine(word, encounter);
      saved = (await db.vocabulary.get(word.id))!;
    } else {
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
    } else {
      const personal = saved.meanings.filter(
        (meaning) => meaning.dictionaryId === "personal",
      );
      if (request.definitionIndex === undefined)
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
      else {
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
    }
    await db.vocabulary.put(saved);
    await updateSavedFields(saved.id);
    return (await getWord(saved.id, encounter))!;
  });
}

export async function replaceMeanings(
  id: string,
  meanings: Vocabulary["meanings"],
  noteId?: string,
) {
  return db.transaction("rw", wordWriteTables(), async () => {
    await db.vocabulary
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
    if (noteId) await refreshDictionaryFields(id, noteId);
    else await updateSavedFields(id);
  });
}

export async function saveCardFields(
  request: Extract<Request, { action: "saveCardFields" }>,
) {
  await saveCustomFields(request.id, request.noteId, request.fields);
}

async function saveSentenceTranslationField(
  wordId: string,
  sentence: string,
  text: string,
) {
  const card = await readingCard(wordId);
  const document = card && (await getCardDocument(card.id));
  if (!document) return;
  const { sentence: sentenceIndex, translation } = document.noteType.bindings;
  if (
    sentenceIndex === undefined ||
    translation === undefined ||
    fieldText(document.note.fields[sentenceIndex] || "", false) !== sentence
  )
    return;
  const fields = [...document.note.fields];
  fields[translation] = escapeHtml(text);
  await db.notes.update(document.note.id, {
    fields,
    version: document.note.version + 1,
    updated: Date.now(),
  });
}

export async function saveCustomTranslation(
  request: Extract<Request, { action: "saveCustomTranslation" }>,
) {
  await db.transaction(
    "rw",
    [db.vocabulary, db.sentences, db.cards, db.notes, db.noteTypes],
    async () => {
      const word = await db.vocabulary.get(request.id);
      if (!word) throw new Error(t("word_not_found"));
      await cacheContext(word, request.context);
      const id = sentenceId(word.language, request.context.sentence);
      const sentence = await db.sentences.get(id);
      const translations = { ...sentence?.customTranslations };
      if (request.text) translations[request.language] = request.text;
      else delete translations[request.language];
      await db.sentences.update(id, { customTranslations: translations });
      await saveSentenceTranslationField(
        request.id,
        request.context.sentence,
        request.text ||
          (sentence?.translation?.language === request.language
            ? sentence.translation.text
            : ""),
      );
      await db.vocabulary
        .where("id")
        .anyOf(sentence?.wordIds || [word.id])
        .modify((saved) => {
          saved.version++;
          saved.updated = Date.now();
        });
    },
  );
}

export async function setMastered(word: LookupWord, value: boolean) {
  return db.transaction("rw", wordWriteTables(), async () => {
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    saved.known = value;
    saved.updated = Date.now();
    saved.version++;
    await db.vocabulary.put(saved);
    const card = await ensureReaderCard(saved);
    await db.cards.update(card.id, {
      suspended: false,
      schedule: !value && !card.schedule ? emptySchedule() : card.schedule,
      srsVersion: card.srsVersion + 1,
      version: card.version + 1,
      updated: Date.now(),
    });
    return (await getWord(saved.id))!;
  });
}

export async function saveTranslation(
  request: Extract<Request, { action: "saveTranslation" }>,
) {
  await db.transaction(
    "rw",
    [db.vocabulary, db.sentences, db.cards, db.notes, db.noteTypes],
    async () => {
      const word = await db.vocabulary.get(request.id);
      if (!word) return;
      const id = sentenceId(word.language, request.sentence);
      const sentence = await db.sentences.get(id);
      await db.sentences.update(id, { translation: request.translation });
      if (!sentence?.customTranslations?.[request.translation.language])
        await saveSentenceTranslationField(
          word.id,
          request.sentence,
          request.translation.text,
        );
    },
  );
}

export async function deleteDefinition(
  request: Extract<Request, { action: "deleteDefinition" }>,
) {
  return db.transaction("rw", wordWriteTables(), async () => {
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
    await updateSavedFields(request.id);
  });
}

export async function deleteWord(
  request: Extract<Request, { action: "deleteWord" }>,
) {
  if (request.cardId !== undefined) {
    const card = await db.cards.get(request.cardId);
    const note = card && (await db.notes.get(card.noteId));
    if (!note || note.wordId !== request.id)
      throw new Error(t("card_not_found"));
    return deleteCards([request.cardId]);
  }
  return deleteWords([request.id]);
}
async function deleteWords(ids: string[]) {
  if (!ids.length) return;
  const notes = await db.notes.where("wordId").anyOf(ids).toArray();
  const cards = notes.length
    ? await db.cards
        .where("noteId")
        .anyOf(notes.map((note) => note.id))
        .primaryKeys()
    : [];
  await deleteCards(cards);
  await db.transaction("rw", [db.vocabulary, db.audio, db.notes], async () => {
    await db.vocabulary.bulkDelete(ids);
    await db.notes.bulkDelete(notes.map((note) => note.id));
    await db.audio.bulkDelete(ids);
  });
}

export async function setRetentionOverride(
  request: Extract<Request, { action: "retentionOverride" }>,
) {
  const word = await getWord(request.id);
  if (!word?.cardId) throw new Error(t("select_reading_card"));
  const card = await db.cards.get(word.cardId);
  if (card)
    await db.cards.update(card.id, {
      retentionOverride: request.value,
      srsVersion: card.srsVersion + 1,
      version: card.version + 1,
      updated: Date.now(),
    });
}
