import type { SchedulingPreferences } from "@/srs/preferences";
import type { ReviewWord } from "@/vocabulary/model";

export function queueRandom(key: string, day: number) {
  let hash = 2166136261 ^ day;
  for (let index = 0; index < key.length; index++)
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  return (hash >>> 0) / 2 ** 32;
}

export function mergeQueues(
  cards: ReviewWord[],
  reviews: ReviewWord[],
  order: SchedulingPreferences["newReviewOrder"],
  day: number,
) {
  if (order === "before") return [...cards, ...reviews];
  if (order === "after") return [...reviews, ...cards];
  const mixed: ReviewWord[] = [];
  let card = 0,
    review = 0;
  while (card < cards.length && review < reviews.length) {
    // Stable choices preserve the mix when the queue reloads after an answer.
    const choice = queueRandom(
      `${cards[card]!.id}\0${reviews[review]!.id}`,
      day,
    );
    const remaining = cards.length - card;
    mixed.push(
      choice < remaining / (remaining + reviews.length - review)
        ? cards[card++]!
        : reviews[review++]!,
    );
  }
  return [...mixed, ...cards.slice(card), ...reviews.slice(review)];
}
