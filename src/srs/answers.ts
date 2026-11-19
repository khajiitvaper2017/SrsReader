import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { scheduleAnswers } from "@/srs/scheduler";
import { rwkvInterval } from "@/srs/engines/rwkv/interval";
import { simulateAnswers } from "@/srs/engines/rwkv/simulate";
import { loadRwkvState } from "@/srs/engines/rwkv/state";
import { emptySchedule } from "@/srs/model";
import { effectiveRetention } from "@/srs/retention";
import type { ReviewWord } from "@/vocabulary/model";
import { db } from "@/platform/database/db";
import { cardDeckPreferences } from "@/srs/preferences";

export type SchedulingCard = Pick<
  ReviewWord,
  "id" | "language" | "lemma" | "reading" | "card" | "retentionOverride"
> & { wordId?: string };

export async function candidates(
  word: SchedulingCard,
  settings: Settings,
  now: number,
  durationMs: number | null,
) {
  const card = word.card ?? emptySchedule(now);
  const retention = await effectiveRetention(word, settings);
  const neural =
    settings.algorithm === "rwkv"
      ? simulateAnswers(
          await loadRwkvState(word.id, word.language, settings),
          word.id,
          word.language,
          now,
          durationMs,
          settings,
        )
      : undefined;
  const answers = scheduleAnswers(
    word.id,
    card,
    now,
    retention,
    settings,
    neural?.answers.map((answer) =>
      rwkvInterval(neural.model, answer, word.language, retention, settings),
    ),
  );
  return {
    schedules: answers.map((answer) => answer.schedule),
    revlogs: answers.map((answer) => answer.revlog),
    retention,
    neural,
  };
}

export async function preview(
  word: (SchedulingCard & Partial<Pick<ReviewWord, "document">>) | undefined,
  durationMs: number | null = null,
) {
  if (!word) return [];
  const card = word.document?.card ?? { language: word.language, deckId: null };
  const deck = card.deckId ? await db.decks.get(card.deckId) : undefined;
  const settings = cardDeckPreferences(
    await getSettings(),
    card,
    deck?.reviewSettings,
  );
  return (
    await candidates(word, settings, Date.now(), durationMs)
  ).schedules.map((card) => card.dueAt);
}
