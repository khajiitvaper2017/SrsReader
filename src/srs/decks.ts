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
  const deck = mined ? undefined : await db.decks.get(deckId);
  if (
    (mined && operation === "delete") ||
    (!mined && (!deck || deck.language !== language))
  )
    throw new Error(t("study_deck_not_found"));
  const cards = await db.cards
    .where("language")
    .equals(language)
    .filter((card) => card.deckId === (mined ? null : deckId))
    .primaryKeys();
  await deleteCards(cards);
  if (!mined && operation === "delete") await db.decks.delete(deckId);
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
