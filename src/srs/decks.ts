import { lookupMany } from "@/dictionaries/lookup";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { emptySchedule } from "@/srs/model";
import { buildQueue } from "@/srs/queue-policy";
import { dailyCounts } from "@/srs/workload";
import type { Vocabulary } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";
import { snapshot } from "@/vocabulary/snapshot";
import { isFrequencyWord, studyGroups, wordsInDeck } from "@/srs/deck-words";
import { deleteWords } from "@/vocabulary/storage";
import Dexie from "dexie";

export async function studyOverview(settings: Settings) {
  const [words, decks] = await Promise.all([
    db.vocabulary.toArray(),
    db.decks.toArray(),
  ]);
  const languages = [
    ...new Set([
      ...settings.studyLanguages,
      settings.studyLanguage,
      ...words.map((word) => word.language),
      ...decks.map((deck) => deck.language),
    ]),
  ].filter(Boolean);
  return Promise.all(
    languages.map(async (language) => {
      const preferences = { ...settings, studyLanguage: language };
      const counts = await dailyCounts(preferences);
      const groups = studyGroups(
        words.filter((word) => word.language === language),
        decks.filter((deck) => deck.language === language),
      );
      function summary(entries: Vocabulary[]) {
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
          wordCount: entries.length,
        };
      }
      return {
        language,
        ...summary(wordsInDeck(groups)),
        mined: summary(groups.mined),
        decks: groups.decks.map((deck) => ({
          id: deck.id,
          name: deck.name,
          ...summary(wordsInDeck(groups, deck.id)),
        })),
      };
    }),
  );
}

export async function manageStudyDeck(
  language: string,
  deckId: string,
  operation: "clear" | "delete",
) {
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
      const [words, decks] = await Promise.all([
        db.vocabulary.where("language").equals(language).toArray(),
        db.decks.where("language").equals(language).toArray(),
      ]);
      const groups = studyGroups(words, decks);
      const mined = deckId === "mined";
      const deck = groups.decks.find((deck) => deck.id === deckId);
      if ((mined && operation === "delete") || (!mined && !deck))
        throw new Error(t("study_deck_not_found"));
      await deleteWords(
        (mined ? groups.mined : deck!.words).map((word) => word.id),
      );
      if (!mined) {
        if (operation === "delete") await db.decks.delete(deckId);
        else await db.decks.update(deckId, { wordIds: [] });
      }
    },
  );
}

export async function createFrequencyDeck(
  dictionaryId: string,
  limit: number,
  name: string,
) {
  const dictionary = await db.dictionaries.get(dictionaryId);
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
  const vocabulary: Vocabulary[] = [];
  const ids = new Set<string>();
  for (let offset = 0; offset < selected.length; offset += 100) {
    const batch = selected.slice(offset, offset + 100);
    const results = await lookupMany(
      batch.map((entry) => entry.key),
      dictionary.language,
    );
    for (const entry of batch) {
      const result = results
        .get(entry.key)
        ?.words.find(
          (word) =>
            isFrequencyWord(word.lemma) &&
            (entry.reading === null || word.reading === entry.reading),
        );
      if (!result?.meanings.length || ids.has(result.id)) continue;
      if (await db.vocabulary.get(result.id)) continue;
      ids.add(result.id);
      const word = freshWord(await snapshot(result));
      word.mined = false;
      word.card = emptySchedule();
      word.srsVersion++;
      vocabulary.push(word);
    }
  }
  if (!ids.size) throw new Error(t("frequency_deck_no_new_words"));
  const deck = {
    id: crypto.randomUUID(),
    language: dictionary.language,
    name,
    dictionaryId,
    limit,
    wordIds: [...ids],
    created: Date.now(),
  };
  await db.transaction("rw", [db.vocabulary, db.decks], async () => {
    await db.vocabulary.bulkPut(vocabulary);
    await db.decks.add(deck);
  });
  return deck;
}
