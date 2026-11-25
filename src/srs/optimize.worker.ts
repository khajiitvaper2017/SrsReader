import wasmUrl from "@open-spaced-repetition/binding-wasm32-wasip1/wasm.wasm?url";
import { instantiate } from "@open-spaced-repetition/binding-wasm32-wasip1/workerd";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";

type Input = Pick<Settings, "fsrsVersion" | "rolloverHour" | "relearningSteps">;

self.onmessage = async ({ data }: MessageEvent<Input>) => {
  try {
    const [reviews, cards] = await db.transaction(
      "r",
      db.reviews,
      db.cards,
      () =>
        Promise.all([
          db.reviews
            .filter((review) => review.active && !!review.before)
            .toArray(),
          db.cards.toCollection().primaryKeys(),
        ]),
    );
    const ids = new Map(cards.map((id, index) => [id, index + 1]));
    const csv = [
      "review_time,card_id,review_rating,review_duration,review_state",
    ];
    for (const review of reviews.sort(
      (a, b) => a.time - b.time || a.sequence - b.sequence,
    )) {
      const id = ids.get(review.cardId);
      if (id === undefined) continue;
      const state = review.before?.schedule?.state ?? 0;
      csv.push(
        [
          review.time,
          id,
          review.rating,
          Math.round(review.durationMs ?? 0),
          state,
        ].join(","),
      );
    }
    if (csv.length < 3) {
      self.postMessage({ type: "insufficient" });
      return;
    }
    const binding = await instantiate(
      fetch(wasmUrl).then((response) => WebAssembly.compileStreaming(response)),
    );
    const modelVersion = `FSRS-${data.fsrsVersion}` as const;
    const { items, cardIds } = binding.convertCsvToFsrsItemsWithCardIds(
      new TextEncoder().encode(csv.join("\n")),
      data.rolloverHour,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      modelVersion,
    );
    if (!items.some((item) => item.includeLongTermReviews())) {
      self.postMessage({ type: "insufficient" });
      return;
    }
    const weights = await binding.computeParameters(items, {
      modelVersion,
      cardIds,
      enableShortTerm: true,
      numRelearningSteps: data.relearningSteps.length,
    });
    self.postMessage({ type: "result", weights });
  } catch (error) {
    console.error("[SrsReader] FSRS optimization failed", error);
    self.postMessage({ type: "failed" });
  }
};
