import { db } from "@/platform/database/db";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { candidates } from "@/srs/answers";
import { commitReview } from "@/srs/storage";
import { autoBuriesAfterAgain } from "@/srs/workload";
import type { ReadingContext, ReviewWord } from "@/vocabulary/model";
import { cacheContext } from "@/examples/sentences";
import { reviewCard } from "@/vocabulary/storage";
import type { Grade } from "ts-fsrs";
import { deckPreferences } from "@/srs/preferences";

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
  const settings = deckPreferences(await getSettings(), deck?.reviewSettings);
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
  return { word: (await reviewCard(saved.id))!, reviewId: id, autoBuried };
}
