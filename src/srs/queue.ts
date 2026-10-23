import { orderNewWords } from "@/dictionaries/frequency";
import { getSettings } from "@/settings/store";
import { buildQueue } from "@/srs/queue-policy";
import { dailyCounts } from "@/srs/workload";
import { languageWords } from "@/vocabulary/storage";
import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { studyGroups } from "@/srs/deck-words";

export async function reviewQueue(deckId?: string) {
  const settings = await getSettings(),
    now = Date.now();
  const [saved, decks] = await Promise.all([
    languageWords(settings.studyLanguage),
    db.decks.where("language").equals(settings.studyLanguage).toArray(),
  ]);
  const groups = studyGroups(saved, decks);
  const mined = deckId === "mined";
  const deck = groups.decks.find((deck) => deck.id === deckId);
  if (deckId && !mined && !deck) throw new Error(t("study_deck_not_found"));
  const included = mined
    ? groups.mined
    : deck
      ? deck.words
      : [...groups.mined, ...groups.decks.flatMap((deck) => deck.words)];
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
