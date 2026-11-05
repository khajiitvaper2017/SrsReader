import { listFrequencyDictionaries } from "@/dictionaries/storage";
import type { LookupWord } from "@/dictionaries/model";
import { clearLookupCache, lookupMany } from "@/dictionaries/lookup";
import { analyzeWords } from "@/languages/morphology";
import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { buildQueue } from "@/srs/queue-policy";
import { dailyCounts } from "@/srs/workload";
import type { Vocabulary, ReviewWord } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";
import { snapshot } from "@/vocabulary/snapshot";
import { isFrequencyWord, studyGroups, wordsInDeck } from "@/srs/deck-words";
import {
  allReviewCards,
  replaceMeanings,
  wordWriteTables,
} from "@/vocabulary/storage";
import { deleteCards, ensureReaderCard } from "@/cards/storage";
import Dexie from "dexie";
import { deckContains, deckIdsInTree, deckTree } from "@/srs/deck-tree";
import type { Deck } from "@/srs/deck-model";

async function keepParentDecks(decks: Deck[], path: string) {
  const parents = deckTree(decks).filter(
    (parent) =>
      parent.name !== path &&
      deckContains(parent.name, path) &&
      !decks.some((deck) => deck.id === parent.id),
  );
  await db.decks.bulkPut(
    parents.map((parent) => ({
      id: crypto.randomUUID(),
      name: parent.name,
      language: parent.language,
      created: parent.created,
    })),
  );
}

export async function studyOverview(settings: Settings) {
  const [words, decks] = await Promise.all([
    allReviewCards(),
    db.decks.toArray(),
  ]);
  return Promise.all(
    settings.studyLanguages.map(async (language) => {
      const preferences = { ...settings, studyLanguage: language };
      const counts = await dailyCounts(preferences);
      const groups = studyGroups(
        words.filter((word) => word.language === language),
        decks.filter((deck) => deck.language === language),
      );
      function summary(entries: ReviewWord[]) {
        const active = entries.filter(
          (word) => word.card && !word.known && !word.suspended,
        );
        const queue = buildQueue(
          active,
          counts,
          preferences,
          Date.now(),
          active.filter((word) => word.card!.state === 0),
        );
        return {
          fresh: queue.fresh,
          learning: queue.learning + queue.relearning,
          due: queue.reviews,
          total: active.length,
          wordCount: new Set(entries.map((word) => word.wordId || word.noteId))
            .size,
        };
      }
      return {
        language,
        ...summary(wordsInDeck(groups)),
        mined: summary(wordsInDeck(groups, "mined")),
        decks: groups.decks.map((deck) => ({
          id: deck.id,
          name: deck.name,
          label: deck.label,
          depth: deck.depth,
          parentId: deck.parentId,
          dictionaryId: deck.dictionaryId,
          ...summary(deck.words),
        })),
      };
    }),
  );
}

export async function manageStudyDeck(
  language: string,
  deckId: string,
  operation: "refresh" | "clear" | "delete",
) {
  if (operation === "refresh") return refreshFrequencyDeck(language, deckId);
  const mined = deckId === "mined";
  if (mined && operation === "delete")
    throw new Error(t("study_deck_not_found"));
  const decks = await db.decks.where("language").equals(language).toArray();
  const ids = mined ? [] : deckIdsInTree(decks, deckId);
  if (!mined && operation === "delete")
    await keepParentDecks(
      decks,
      deckTree(decks).find((deck) => deck.id === deckId)!.name,
    );
  const cards = await db.cards
    .where("language")
    .equals(language)
    .filter((card) =>
      mined ? card.deckId === null : ids.includes(card.deckId!),
    )
    .primaryKeys();
  await deleteCards(cards);
  if (!mined && operation === "delete") await db.decks.bulkDelete(ids);
}

export async function saveStudyDeck(
  language: string,
  name: string,
  parentId: string | null,
  id?: string,
) {
  const decks = await db.decks.where("language").equals(language).toArray();
  const nodes = deckTree(decks);
  const current = id ? nodes.find((deck) => deck.id === id) : undefined;
  const parent = parentId
    ? nodes.find((deck) => deck.id === parentId)
    : undefined;
  if ((id && !current) || (parentId && !parent))
    throw new Error(t("study_deck_not_found"));
  if (current && parent && deckContains(current.name, parent.name))
    throw new Error(t("study_deck_parent_invalid"));
  const path = parent ? `${parent.name}::${name}` : name;
  const moving = new Set(current ? deckIdsInTree(decks, current.id) : []);
  const updated = decks
    .filter((deck) => moving.has(deck.id))
    .map((deck) => ({
      ...deck,
      name: path + deck.name.slice(current!.name.length),
    }));
  if (!current || !decks.some((deck) => deck.id === current.id))
    updated.push({
      id: crypto.randomUUID(),
      name: path,
      language,
      created: Date.now(),
    });
  if (
    nodes.some(
      (node) =>
        !moving.has(node.id) &&
        node.id !== id &&
        updated.some((deck) => deck.name === node.name),
    )
  )
    throw new Error(t("study_deck_name_exists"));
  if (current) await keepParentDecks(decks, current.name);
  await db.decks.bulkPut(updated);
}

async function frequencyDeckWords(dictionaryId: string, limit: number) {
  const dictionary = (await listFrequencyDictionaries()).find(
    (dictionary) => dictionary.id === dictionaryId,
  );
  if (!dictionary?.enabled || !dictionary.frequencyCount)
    throw new Error(t("frequency_deck_dictionary_missing"));
  const entries = new Map<string, { key: string; reading: string | null }>();
  await db.frequencies
    .where("[revisionId+rank]")
    .between(
      [dictionary.revisionId, Dexie.minKey],
      [dictionary.revisionId, Dexie.maxKey],
    )
    .until(() => entries.size >= limit)
    .each((row) => {
      if (!isFrequencyWord(row.key)) return;
      const key = JSON.stringify([row.key, row.reading]);
      if (!entries.has(key)) entries.set(key, row);
    });
  const selected = [...entries.values()];
  const words = new Map<string, LookupWord>();
  for (let offset = 0; offset < selected.length; offset += 100) {
    const batch = selected.slice(offset, offset + 100);
    const terms = batch.map((entry) => entry.key);
    const [results, analyses] = await Promise.all([
      lookupMany(terms, dictionary.language),
      analyzeWords(terms, dictionary.language),
    ]);
    for (const entry of batch) {
      const key = folded(entry.key, dictionary.language);
      const candidates = results.get(normalize(entry.key))?.words ?? [];
      if (
        folded(analyses.get(entry.key) ?? entry.key, dictionary.language) !==
          key ||
        candidates.some(
          (word) =>
            word.forms.length > 0 &&
            folded(word.lemma, dictionary.language) !== key,
        )
      )
        continue;
      const result = candidates.find(
        (word) =>
          isFrequencyWord(word.lemma) &&
          folded(word.lemma, dictionary.language) === key &&
          (entry.reading === null || word.reading === entry.reading),
      );
      if (result?.meanings.length) words.set(result.id, result);
    }
  }
  return { dictionary, words: [...words.values()] };
}

export async function createFrequencyDeck(
  dictionaryId: string,
  limit: number,
  name: string,
) {
  const { dictionary, words } = await frequencyDeckWords(dictionaryId, limit);
  if (
    (
      await db.decks.where("language").equals(dictionary.language).toArray()
    ).some((deck) => deck.name === name)
  )
    throw new Error(t("study_deck_name_exists"));
  const vocabulary: Vocabulary[] = [];
  for (const word of words) {
    if (!(await db.vocabulary.get(word.id))) {
      const saved = freshWord(await snapshot(word));
      saved.mined = false;
      vocabulary.push(saved);
    }
  }
  if (!vocabulary.length) throw new Error(t("frequency_deck_no_new_words"));
  const deck = {
    id: crypto.randomUUID(),
    language: dictionary.language,
    name,
    dictionaryId,
    limit,
    created: Date.now(),
  };
  await db.transaction("rw", [...wordWriteTables(), db.decks], async () => {
    for (const word of vocabulary) {
      await db.vocabulary.put(word);
      const card = await ensureReaderCard(word);
      await db.cards.update(card.id, { deckId: deck.id });
    }
    await db.decks.add(deck);
  });
  return deck;
}

async function refreshFrequencyDeck(language: string, deckId: string) {
  const deck = await db.decks.get(deckId);
  if (
    !deck ||
    deck.language !== language ||
    !deck.dictionaryId ||
    deck.limit === undefined
  )
    throw new Error(t("study_deck_not_found"));
  clearLookupCache();
  const { words } = await frequencyDeckWords(deck.dictionaryId, deck.limit);
  const [saved, cards] = await Promise.all([
    db.vocabulary.where("language").equals(language).toArray(),
    allReviewCards(language),
  ]);
  const byId = new Map(saved.map((word) => [word.id, word]));
  const assigned = new Set(
    cards
      .filter((card) => card.document.card.deckId !== deckId)
      .flatMap((card) => (card.wordId ? [card.wordId] : [])),
  );
  const selected = words.filter(
    (word) =>
      !assigned.has(word.id) &&
      (!byId.has(word.id) || byId.get(word.id)!.mined === false),
  );
  const selectedIds = new Set(selected.map((word) => word.id));
  const snapshots = await Promise.all(selected.map(snapshot));
  await db.transaction(
    "rw",
    [
      ...wordWriteTables(),
      db.decks,
      db.audio,
      db.srsMeta,
      db.rwkvCards,
      db.rwkvEntities,
      db.rwkvMeta,
    ],
    async () => {
      for (const word of snapshots) {
        if (byId.has(word.id))
          await replaceMeanings(
            word.id,
            word.meanings.filter(
              (meaning) => meaning.dictionaryId !== "personal",
            ),
          );
        else await db.vocabulary.put({ ...freshWord(word), mined: false });
        const card = await ensureReaderCard(
          (await db.vocabulary.get(word.id))!,
        );
        await db.cards.update(card.id, { deckId });
      }
      await deleteCards(
        cards
          .filter(
            (card) =>
              card.document.card.deckId === deckId &&
              (!card.wordId || !selectedIds.has(card.wordId)),
          )
          .map((card) => card.id),
      );
    },
  );
}
