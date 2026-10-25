import { immersionRanks } from "@/dictionaries/immersion";
import { listFrequencyDictionaries } from "@/dictionaries/storage";
import type { LookupWord } from "@/dictionaries/model";
import { clearLookupCache, lookupMany } from "@/dictionaries/lookup";
import { analyzeWords } from "@/languages/morphology";
import { folded, normalize } from "@/languages/text";
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
import { deleteWords, replaceMeanings } from "@/vocabulary/storage";
import Dexie from "dexie";

export async function studyOverview(settings: Settings) {
  const [words, decks] = await Promise.all([
    db.vocabulary.toArray(),
    db.decks.toArray(),
  ]);
  const languages = settings.studyLanguages;
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
        mined: summary(wordsInDeck(groups, "mined")),
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
  operation: "refresh" | "clear" | "delete",
) {
  if (operation === "refresh") return refreshFrequencyDeck(language, deckId);
  await db.transaction(
    "rw",
    [
      db.vocabulary,
      db.decks,
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

async function frequencyDeckWords(dictionaryId: string, limit: number) {
  const dictionary = (await listFrequencyDictionaries()).find(
    (dictionary) => dictionary.id === dictionaryId,
  );
  if (!dictionary?.enabled || !dictionary.frequencyCount)
    throw new Error(t("frequency_deck_dictionary_missing"));
  const entries = new Map<string, { key: string; reading: string | null }>();
  if (dictionary.immersion) {
    for (const word of await immersionRanks(dictionary.id)) {
      if (!isFrequencyWord(word.lemma)) continue;
      const key = JSON.stringify([word.lemma, null]);
      entries.set(key, { key: word.lemma, reading: null });
      if (entries.size >= limit) break;
    }
  } else {
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
  }
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

function frequencyCard(word: LookupWord) {
  const saved = freshWord(word);
  saved.mined = false;
  saved.card = emptySchedule();
  saved.srsVersion++;
  return saved;
}

export async function createFrequencyDeck(
  dictionaryId: string,
  limit: number,
  name: string,
) {
  const { dictionary, words } = await frequencyDeckWords(dictionaryId, limit);
  const vocabulary: Vocabulary[] = [];
  for (const word of words) {
    if (!(await db.vocabulary.get(word.id)))
      vocabulary.push(frequencyCard(await snapshot(word)));
  }
  if (!vocabulary.length) throw new Error(t("frequency_deck_no_new_words"));
  const deck = {
    id: crypto.randomUUID(),
    language: dictionary.language,
    name,
    dictionaryId,
    limit,
    wordIds: vocabulary.map((word) => word.id),
    created: Date.now(),
  };
  await db.transaction("rw", [db.vocabulary, db.decks], async () => {
    await db.vocabulary.bulkPut(vocabulary);
    await db.decks.add(deck);
  });
  return deck;
}

async function refreshFrequencyDeck(language: string, deckId: string) {
  const deck = await db.decks.get(deckId);
  if (!deck || deck.language !== language)
    throw new Error(t("study_deck_not_found"));
  clearLookupCache();
  const { words } = await frequencyDeckWords(deck.dictionaryId, deck.limit);
  const [saved, decks] = await Promise.all([
    db.vocabulary.where("language").equals(language).toArray(),
    db.decks.where("language").equals(language).toArray(),
  ]);
  const byId = new Map(saved.map((word) => [word.id, word]));
  const assigned = new Set(
    decks
      .filter((other) => other.id !== deckId)
      .flatMap((other) => other.wordIds),
  );
  const selected = words.filter((word) => {
    const existing = byId.get(word.id);
    return !assigned.has(word.id) && (!existing || existing.mined === false);
  });
  const snapshots = await Promise.all(selected.map(snapshot));
  await db.transaction("rw", [db.vocabulary, db.decks], async () => {
    for (const word of snapshots) {
      if (byId.has(word.id))
        await replaceMeanings(
          word.id,
          word.meanings.filter(
            (meaning) => meaning.dictionaryId !== "personal",
          ),
        );
      else await db.vocabulary.add(frequencyCard(word));
    }
    await db.vocabulary
      .where("id")
      .anyOf(deck.wordIds)
      .filter((word) => !isFrequencyWord(word.lemma))
      .modify({ mined: false });
    await db.decks.update(deckId, { wordIds: selected.map((word) => word.id) });
  });
}
