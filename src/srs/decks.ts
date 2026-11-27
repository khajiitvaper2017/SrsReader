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
import { queueEntries } from "@/srs/queue-entries";
import { deckQueueScope } from "@/srs/deck-queue";
import type { Vocabulary } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";
import { snapshot } from "@/vocabulary/snapshot";
import { isFrequencyWord, studyGroups } from "@/srs/deck-words";
import {
  allReviewCards,
  replaceMeanings,
  wordWriteTables,
} from "@/vocabulary/storage";
import { deleteCards, ensureReaderCard } from "@/cards/storage";
import Dexie from "dexie";
import {
  deckBranch,
  deckIdsInTree,
  deckTree,
  type DeckNode,
} from "@/srs/deck-tree";
import type { Deck } from "@/srs/deck-model";
import type { Card } from "@/cards/model";
import type { DeckReviewSettings } from "@/srs/preferences";

async function keepParentDecks(
  decks: Deck[],
  nodes: DeckNode[],
  id: string | null,
) {
  const saved = new Set(decks.map((deck) => deck.id));
  const parents: Deck[] = [];
  while (id) {
    const node = nodes.find((deck) => deck.id === id)!;
    const { id: parent, label, parentId, language, legacyPath, created } = node;
    if (!saved.has(parent))
      parents.push({
        id: parent,
        name: label,
        parentId,
        language,
        legacyPath,
        created,
      });
    id = parentId;
  }
  if (parents.length) await db.decks.bulkPut(parents);
}

export async function studyOverview(settings: Settings) {
  const decks = await db.decks.toArray();
  return Promise.all(
    settings.studyLanguages.map(async (language) => {
      const preferences = { ...settings, studyLanguage: language };
      const now = Date.now();
      const counts = await dailyCounts(preferences, now);
      const groups = studyGroups(
        await queueEntries(language),
        decks.filter((deck) => deck.language === language),
      );
      function summary(deckId?: string) {
        const scope = deckQueueScope(preferences, groups, counts, now, deckId);
        const queue = buildQueue(
          scope.words,
          scope.counts,
          scope.settings,
          now,
          scope.words.filter((word) => word.card!.state === 0),
          undefined,
          scope.withinDeckLimit,
        );
        return {
          fresh: queue.fresh,
          learning: queue.learning + queue.relearning,
          due: queue.reviews,
          total: scope.words.length + scope.deferredMined,
          wordCount: new Set(
            scope.entries.map((word) => word.wordId || word.noteId),
          ).size,
        };
      }
      return {
        language,
        ...summary(),
        mined: {
          ...summary("mined"),
          reviewSettings: preferences.minedReviewSettings[language],
        },
        decks: groups.decks.map((deck) => ({
          id: deck.id,
          name: deck.name,
          label: deck.label,
          depth: deck.depth,
          parentId: deck.parentId,
          dictionaryId: deck.dictionaryId,
          reviewSettings: deck.reviewSettings,
          ...summary(deck.id),
        })),
      };
    }),
  );
}

export async function manageStudyDeck(
  language: string,
  deckId: string,
  operation: "refresh" | "clear" | "delete",
  dictionaryId?: string,
) {
  if (operation === "refresh")
    return refreshFrequencyDeck(language, deckId, dictionaryId);
  const mined = deckId === "mined";
  if (mined && operation === "delete")
    throw new Error(t("study_deck_not_found"));
  const decks = await db.decks.where("language").equals(language).toArray();
  const ids = mined ? [] : deckIdsInTree(decks, deckId);
  if (!mined && operation === "delete") {
    const nodes = deckTree(decks);
    await keepParentDecks(
      decks,
      nodes,
      nodes.find((deck) => deck.id === deckId)!.parentId,
    );
  }
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
  if (
    current &&
    parent &&
    deckBranch(nodes, nodes.indexOf(current)).some(
      (deck) => deck.id === parent.id,
    )
  )
    throw new Error(t("study_deck_parent_invalid"));
  if (
    nodes.some(
      (node) =>
        node.id !== id && node.parentId === parentId && node.label === name,
    )
  )
    throw new Error(t("study_deck_name_exists"));
  await db.transaction("rw", db.decks, async () => {
    await keepParentDecks(decks, nodes, parentId);
    if (current && current.parentId !== parentId)
      await keepParentDecks(decks, nodes, current.parentId);
    await db.decks.put({
      ...decks.find((deck) => deck.id === id),
      id: current?.id ?? crypto.randomUUID(),
      created: current?.created ?? Date.now(),
      language,
      name,
      parentId,
      legacyPath: current?.legacyPath,
    });
  });
}

export async function saveDeckReviewSettings(
  language: string,
  id: string,
  reviewSettings: DeckReviewSettings | null,
) {
  await db.transaction("rw", db.decks, async () => {
    const decks = await db.decks.where("language").equals(language).toArray();
    const nodes = deckTree(decks);
    if (!nodes.some((deck) => deck.id === id))
      throw new Error(t("study_deck_not_found"));
    await keepParentDecks(decks, nodes, id);
    await db.decks.update(id, { reviewSettings: reviewSettings ?? undefined });
  });
}

export async function deckReviewSettingsForCards(
  cards: Pick<Card, "deckId">[],
) {
  const ids = [
    ...new Set(cards.flatMap((card) => (card.deckId ? [card.deckId] : []))),
  ];
  const decks = await db.decks.bulkGet(ids);
  return new Map(
    decks.flatMap((deck) =>
      deck?.reviewSettings ? [[deck.id, deck.reviewSettings] as const] : [],
    ),
  );
}

async function frequencyDeckWords(
  dictionaryId: string,
  limit: number,
  language?: string,
) {
  const dictionary = (await listFrequencyDictionaries()).find(
    (dictionary) => dictionary.id === dictionaryId,
  );
  if (!dictionary?.enabled || (language && dictionary.language !== language))
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
    deckTree(
      await db.decks.where("language").equals(dictionary.language).toArray(),
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
    parentId: null,
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

async function refreshFrequencyDeck(
  language: string,
  deckId: string,
  dictionaryId?: string,
) {
  const deck = await db.decks.get(deckId);
  if (
    !deck ||
    deck.language !== language ||
    !deck.dictionaryId ||
    deck.limit === undefined
  )
    throw new Error(t("study_deck_not_found"));
  clearLookupCache();
  const { dictionary, words } = await frequencyDeckWords(
    dictionaryId ?? deck.dictionaryId,
    deck.limit,
    language,
  );
  if (!words.length) throw new Error(t("frequency_deck_no_matching_words"));
  const [saved, cards] = await Promise.all([
    db.vocabulary.where("language").equals(language).toArray(),
    allReviewCards(language),
  ]);
  const byId = new Map(saved.map((word) => [word.id, word]));
  const members = new Set(
    cards
      .filter((card) => card.document.card.deckId === deckId)
      .map((card) => card.wordId),
  );
  const assigned = new Set(
    cards
      .filter((card) => card.document.card.deckId !== deckId)
      .flatMap((card) => (card.wordId ? [card.wordId] : [])),
  );
  const selected = words.filter(
    (word) =>
      members.has(word.id) ||
      (!assigned.has(word.id) &&
        (!byId.has(word.id) || byId.get(word.id)!.mined === false)),
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
        if (members.has(word.id)) continue;
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
              !card.known &&
              !card.card?.reps &&
              (!card.wordId || !selectedIds.has(card.wordId)),
          )
          .map((card) => card.id),
      );
      if (deck.dictionaryId !== dictionary.id)
        await db.decks.update(deckId, { dictionaryId: dictionary.id });
    },
  );
}
