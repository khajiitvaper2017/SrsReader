import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { fsrsAnswers } from "@/srs/engines/fsrs";
import { rwkvInterval } from "@/srs/engines/rwkv/interval";
import { simulateAnswers } from "@/srs/engines/rwkv/simulate";
import { reviewIntervals } from "@/srs/intervals";
import { emptySchedule } from "@/srs/model";
import { effectiveRetention } from "@/srs/retention";
import { scheduleAnswers } from "@/srs/transitions";
import type { ReviewWord } from "@/vocabulary/model";

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
  const fsrs = fsrsAnswers(card, now, retention, settings);
  const neural =
    settings.algorithm === "rwkv"
      ? await simulateAnswers(word.id, word.language, now, durationMs, settings)
      : undefined;
  const raw = neural
    ? neural.answers.map((answer) =>
        rwkvInterval(neural.model, answer, word.language, retention, settings),
      )
    : fsrs.map((answer) => answer.interval);
  const intervals = reviewIntervals(
    raw,
    settings,
    `${word.id}:${card.reps}`,
    card.state === 2 ||
      (card.state === 3 ? settings.relearningSteps : settings.learningSteps)
        .length === 0,
  );
  return {
    schedules: scheduleAnswers(
      card,
      fsrs.map((answer) => answer.memory),
      intervals,
      now,
      settings,
    ),
    retention,
    neural,
  };
}

export async function preview(
  word: SchedulingCard | undefined,
  durationMs: number | null = null,
) {
  if (!word) return [];
  return (
    await candidates(word, await getSettings(), Date.now(), durationMs)
  ).schedules.map((card) => card.due);
}
