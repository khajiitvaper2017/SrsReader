import {
  cardsForEncounter,
  type ReadingCardIdentity,
} from "@/cards/encounter-key";

export const wordStates = [
  "unknown",
  "new",
  "learning",
  "review",
  "due",
  "known",
  "suspended",
] as const;

export type WordState = (typeof wordStates)[number];

export const wordStateLabels = {
  unknown: "new",
  new: "saved",
  learning: "young",
  review: "mature",
  due: "due",
  known: "mastered",
  suspended: "suspended",
  ignored: "ignored",
  unparsed: "unparsed",
};

export type LearningCard = ReadingCardIdentity & {
  suspended: boolean;
  schedule: { state: number; dueAt: number; scheduledDays: number } | null;
};

export function stateOf(
  word: { known: boolean; linkedCards?: readonly LearningCard[] } | undefined,
  matureIntervalDays: number,
  encounterKey?: string,
): WordState {
  if (!word) return "unknown";
  if (word.known) return "known";
  const cards =
    encounterKey === undefined
      ? word.linkedCards || []
      : cardsForEncounter(word.linkedCards || [], encounterKey);
  if (!cards.length) return encounterKey === undefined ? "new" : "unknown";
  const active = cards.filter((card) => !card.suspended);
  if (!active.length) return "suspended";
  if (
    active.some(
      (card) =>
        card.schedule &&
        card.schedule.state !== 0 &&
        card.schedule.dueAt <= Date.now(),
    )
  )
    return "due";
  if (active.some((card) => !card.schedule || card.schedule.state === 0))
    return "new";
  return active.some(
    (card) =>
      card.schedule!.state !== 2 ||
      card.schedule!.scheduledDays < matureIntervalDays,
  )
    ? "learning"
    : "review";
}

export type WordStateUpdate = {
  state: WordState;
  encounterStates: Record<string, WordState>;
  importedCards?: LearningCard[];
};

export function stateForEncounter(
  update: WordStateUpdate,
  encounterKey?: string,
  matureIntervalDays = 0,
): WordState {
  return encounterKey === undefined || update.state === "known"
    ? update.state
    : (update.encounterStates[encounterKey] ??
        stateOf(
          { known: false, linkedCards: update.importedCards },
          matureIntervalDays,
          encounterKey,
        ));
}
