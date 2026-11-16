import { db } from "@/platform/database/db";
import { languageWords } from "@/vocabulary/storage";
import { studyGroups, wordsInDeck } from "@/srs/deck-words";
import { folded } from "@/languages/text";
import { stateOf } from "@/vocabulary/state";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";
import type { Request } from "@/vocabulary/contracts";
import type { Settings } from "@/settings/model";

async function readSnapshot(language: string) {
  const [words, decks] = await Promise.all([
    languageWords(language),
    db.decks.where("language").equals(language).toArray(),
  ]);
  return { words, decks };
}
const snapshots = new Map<string, ReturnType<typeof readSnapshot>>();
export function clearWordLists() {
  snapshots.clear();
}
function wordListSnapshot(language: string) {
  let result = snapshots.get(language);
  if (!result) {
    if (snapshots.size >= 2) snapshots.delete(snapshots.keys().next().value!);
    result = readSnapshot(language);
    snapshots.set(language, result);
    const pending = result;
    void result.catch(() => {
      if (snapshots.get(language) === pending) snapshots.delete(language);
    });
  }
  return result;
}

export async function listWords(
  request: Extract<Request, { action: "words" }>,
  settings: Settings,
) {
  const language = request.language || settings.studyLanguage;
  const { words, decks } = await wordListSnapshot(language);
  const query = folded(request.query.trim(), language);
  const matching = wordsInDeck(studyGroups(words, decks), request.deckId)
    .filter(
      (word) =>
        (!query ||
          folded(`${word.lemma} ${word.reading}`, language).includes(query)) &&
        (request.filter === "all" ||
          (request.filter === "leeches"
            ? word.leech
            : stateOf(word, settings.matureIntervalDays) === request.filter)),
    )
    .sort((a, b) => b.updated - a.updated);
  const page = Math.min(
    request.page,
    Math.max(1, Math.ceil(matching.length / 50)),
  );
  return {
    total: matching.length,
    page,
    words: matching.slice((page - 1) * 50, page * 50).map((word) => ({
      ...word,
      meanings: applyDefinitionOverrides(word.meanings, word),
    })),
  };
}
