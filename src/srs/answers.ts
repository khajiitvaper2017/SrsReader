import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { fsrsAnswers } from "@/srs/engines/fsrs";
import { rwkvInterval } from "@/srs/engines/rwkv/interval";
import { simulateAnswers } from "@/srs/engines/rwkv/simulate";
import { reviewIntervals } from "@/srs/intervals";
import { emptySchedule } from "@/srs/model";
import { effectiveRetention } from "@/srs/retention";
import { scheduleAnswers } from "@/srs/transitions";
import type { Vocabulary } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";

export async function candidates(
  word: Vocabulary,
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
  word: Vocabulary | undefined,
  durationMs: number | null = null,
  id?: string,
) {
  if (!word && id) {
    const [language, lemma, reading] = JSON.parse(id) as string[];
    word = freshWord({
      id,
      language: language!,
      lemma: lemma!,
      reading: reading!,
      meanings: [],
      forms: [],
    });
  }
  if (!word) return [];
  return (
    await candidates(word, await getSettings(), Date.now(), durationMs)
  ).schedules.map((card) => card.due);
}
