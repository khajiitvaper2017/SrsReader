import { db } from "@/platform/database/db";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { candidates } from "@/srs/answers";
import { commitReview } from "@/srs/storage";
import { autoBuriesAfterAgain } from "@/srs/workload";
import type { ReadingContext, ReviewWord } from "@/vocabulary/model";
import { cacheContext } from "@/examples/sentences";
import type { Grade } from "ts-fsrs";
import { cardDeckPreferences } from "@/srs/preferences";
import { minedCardDeferredUntil } from "@/srs/study-day";

export async function grade(
  word: ReviewWord,
  rating: Grade,
  source: "reading" | "review",
  expectedVersion: number,
  context?: ReadingContext,
  durationMs: number | null = null,
  now = Date.now(),
) {
  const before = await db.cards.get(word.id);
  if (!before || before.srsVersion !== expectedVersion)
    throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
  if (word.known) throw new Error(t("unmaster_this_word_before_reviewing_it"));
  if (before.suspended)
    throw new Error(t("resume_this_word_before_grading_it"));
  const deck = before.deckId ? await db.decks.get(before.deckId) : undefined;
  const settings = cardDeckPreferences(
    await getSettings(),
    before,
    deck?.reviewSettings,
  );
  if (
    !before.schedule?.reps &&
    minedCardDeferredUntil(before.minedAt, settings)
  )
    throw new Error(t("mined_card_waits"));
  const saved = structuredClone(before);
  if (source === "reading" && word.wordId)
    await db.vocabulary.update(word.wordId, { mined: true });
  if (word.wordId)
    await cacheContext({ id: word.wordId, language: word.language }, context);
  const result = await candidates(word, settings, now, durationMs);
  saved.schedule = result.schedules[rating - 1]!;
  const threshold = settings.leechThreshold;
  if (
    threshold &&
    before.schedule?.state === 2 &&
    rating === 1 &&
    saved.schedule.lapses >= threshold &&
    (saved.schedule.lapses - threshold) %
      Math.max(1, Math.ceil(threshold / 2)) ===
      0
  ) {
    saved.leech = true;
    if (settings.leechAction === "suspend") saved.suspended = true;
  }
  saved.updated = now;
  saved.version++;
  saved.srsVersion++;
  const autoBuried =
    rating === 1 &&
    settings.autoBuryFailed &&
    !saved.suspended &&
    (before.buriedUntil ?? 0) <= now &&
    (await autoBuriesAfterAgain(
      word.id,
      word.language,
      settings.rolloverHour,
      now,
    ));
  const id = crypto.randomUUID();
  await commitReview({
    word,
    saved,
    before,
    expectedVersion,
    id,
    rating,
    source,
    durationMs,
    now,
    settings,
    result,
  });
  return {
    word: {
      ...word,
      document: { ...word.document, card: saved },
      card: saved.schedule,
      linkedCards: [saved],
      srsVersion: saved.srsVersion,
      suspended: saved.suspended,
      leech: saved.leech,
      updated: saved.updated,
      ...(source === "reading" && word.wordId ? { mined: true } : {}),
    },
    reviewId: id,
    autoBuried,
  };
}
