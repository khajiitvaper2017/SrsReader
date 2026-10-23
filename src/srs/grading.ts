import type { LookupWord } from "@/dictionaries/model";
import { getSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { candidates } from "@/srs/answers";
import { commitReview } from "@/srs/storage";
import type { ReadingContext } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";
import { cacheContext } from "@/examples/sentences";
import { getWord } from "@/vocabulary/storage";
import type { Grade } from "ts-fsrs";

export async function grade(
  word: LookupWord,
  rating: Grade,
  source: "reading" | "review",
  expectedVersion: number,
  context?: ReadingContext,
  durationMs: number | null = null,
  now = Date.now(),
) {
  const settings = await getSettings();
  const before = await getWord(word.id);
  if ((before?.srsVersion ?? 0) !== expectedVersion)
    throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
  if (before?.known)
    throw new Error(t("unmaster_this_word_before_reviewing_it"));
  if (before?.suspended)
    throw new Error(t("resume_this_word_before_grading_it"));
  const saved = structuredClone(before ?? freshWord(word));
  if (source === "reading") saved.mined = true;
  await cacheContext(word, context);
  const result = await candidates(saved, settings, now, durationMs);
  saved.card = result.schedules[rating - 1]!;
  const threshold = settings.leechThreshold;
  if (
    threshold &&
    before?.card?.state === 2 &&
    rating === 1 &&
    saved.card.lapses >= threshold &&
    (saved.card.lapses - threshold) % Math.max(1, Math.ceil(threshold / 2)) ===
      0
  ) {
    saved.leech = true;
    if (settings.leechAction === "suspend") saved.suspended = true;
  }
  saved.updated = now;
  saved.version++;
  saved.srsVersion++;
  const id = crypto.randomUUID();
  await commitReview({
    word,
    saved,
    before,
    expectedVersion,
    id,
    rating,
    source,
    context,
    durationMs,
    now,
    settings,
    result,
  });
  return { word: saved, reviewId: id };
}
