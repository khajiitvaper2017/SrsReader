import type { AnkiDeckPreset, RawObject } from "@/anki/model";
import type { Proto } from "@/anki/protobuf";
import {
  deckReviewSettingsSchema,
  type DeckReviewSettings,
} from "@/srs/preferences";

const mix = { 0: "mix", 1: "after", 2: "before" };
const gather = { 0: "deck", 4: "random", 5: "deck_random" };
const sort = { 1: "gathered", 4: "random" };
const review = {
  0: "due_random",
  1: "due_deck",
  2: "deck_due",
  3: "interval_asc",
  4: "interval_desc",
  8: "random",
};
const leech = { 0: "suspend", 1: "mark" };
const order = (mapping: Record<number, string>, value: unknown) =>
  typeof value === "number" ? mapping[value] : undefined;
const record = (value: unknown): RawObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawObject)
    : {};
const steps = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter(
          (minutes): minutes is number =>
            typeof minutes === "number" &&
            Number.isFinite(minutes) &&
            minutes > 0,
        )
        .map(
          (minutes) => `${Math.max(0.001, Math.round(minutes * 1000) / 1000)}m`,
        )
    : undefined;
const retention = (value: number | undefined) =>
  value === undefined ? undefined : Math.round(value * 10000) / 10000;

function supported(values: RawObject): DeckReviewSettings {
  return Object.fromEntries(
    Object.entries(deckReviewSettingsSchema.shape).flatMap(([key, schema]) => {
      const parsed = schema.safeParse(values[key]);
      return parsed.success && parsed.data !== undefined
        ? [[key, parsed.data]]
        : [];
    }),
  );
}

export function modernPreset(name: string, config: Proto): AnkiDeckPreset {
  return {
    name,
    settings: supported({
      newLimit: config.number(9),
      reviewLimit: config.number(10),
      learningSteps: steps(config.floats(1)),
      relearningSteps: steps(config.floats(2)),
      retention: retention(config.floats(37)[0]),
      maximumInterval: config.number(16),
      leechThreshold: config.number(22),
      leechAction: order(leech, config.number(21)),
      newGatherOrder: order(gather, config.number(34)),
      newSortOrder: order(sort, config.number(32)),
      newReviewOrder: order(mix, config.number(30)),
      interdayReviewOrder: order(mix, config.number(31)),
      reviewSortOrder: order(review, config.number(33)),
    }),
  };
}

export function legacyPreset(config: RawObject): AnkiDeckPreset {
  const fresh = record(config.new);
  const lapse = record(config.lapse);
  const rev = record(config.rev);
  return {
    name: typeof config.name === "string" ? config.name : undefined,
    settings: supported({
      newLimit: fresh.perDay,
      reviewLimit: rev.perDay,
      learningSteps: steps(fresh.delays),
      relearningSteps: steps(lapse.delays),
      retention: config.desired_retention,
      maximumInterval: rev.maxIvl,
      leechThreshold: lapse.leechFails,
      leechAction: order(leech, lapse.leechAction),
      newGatherOrder: order(gather, config.new_gather_priority),
      newSortOrder: order(sort, config.new_sort_order),
      newReviewOrder: order(mix, config.new_mix),
      interdayReviewOrder: order(mix, config.interday_learning_mix),
      reviewSortOrder: order(review, config.review_order),
    }),
  };
}

export function presetForDeck(
  deck: RawObject,
  preset: AnkiDeckPreset | undefined,
): AnkiDeckPreset | undefined {
  if (deck.dyn) return;
  const settings = {
    ...preset?.settings,
    ...supported({
      newLimit: deck.newLimit ?? undefined,
      reviewLimit: deck.reviewLimit ?? undefined,
      retention:
        typeof deck.desiredRetention === "number"
          ? retention(deck.desiredRetention / 100)
          : undefined,
    }),
  };
  if (Object.keys(settings).length) return { name: preset?.name, settings };
}
