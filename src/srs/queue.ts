import { orderNewWords } from "@/dictionaries/frequency";
import { getSettings } from "@/settings/store";
import { buildQueue } from "@/srs/queue-policy";
import { dailyCounts } from "@/srs/workload";
import { languageWords } from "@/vocabulary/storage";
import { db } from "@/platform/database/db";
import { studyGroups, wordsInDeck } from "@/srs/deck-words";

export async function reviewQueue(deckId?: string) {
  const settings = await getSettings(),
    now = Date.now();
  const [saved, decks] = await Promise.all([
    languageWords(settings.studyLanguage),
    db.decks.where("language").equals(settings.studyLanguage).toArray(),
  ]);
  const groups = studyGroups(saved, decks);
  const included = wordsInDeck(groups, deckId);
  const words = included.filter(
    (word) => word.card && !word.known && !word.suspended,
  );
  const counts = await dailyCounts(settings, now);
  const orderedNew =
    (settings.reviewLimit ?? Infinity) > counts.reviews
      ? await orderNewWords(
          words.filter((word) => word.card!.state === 0),
          settings,
        )
      : [];
  return buildQueue(words, counts, settings, now, orderedNew);
}
