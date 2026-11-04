export type FeatureGlobal = {
  firstDay: number | null;
  previousDay: number | null;
  reviews: number;
  newCards: number;
  today: number | null;
  todayNew: number;
  todayReviews: number;
};
export type FeatureCard = {
  lastTime: number;
  lastDay: number;
  firstDay: number;
  sumDays: number;
  sumSeconds: number;
  lastReviewIndex: number;
  lastNewCount: number;
};
export const emptyFeatures = (): FeatureGlobal => ({
  firstDay: null,
  previousDay: null,
  reviews: 0,
  newCards: 0,
  today: null,
  todayNew: 0,
  todayReviews: 0,
});
const mod = (x: number, n: number) => ((x % n) + n) % n;
const log = (x: number) => (x === -1 ? 0 : Math.log(1 + 1e-5 + x));

function entityCode(identity: string, length: number) {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++)
    hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  return Array.from({ length }, () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return ((hash >>> 0) % 4) - 1.5;
  });
}

export function buildFeatures(
  input: {
    wordId: string;
    language: string;
    time: number;
    day: number;
    rating: number;
    durationMs: number | null;
  },
  previous: FeatureCard | undefined,
  global: FeatureGlobal,
  query = false,
) {
  const day = Math.max(input.day, global.previousDay ?? input.day);
  const firstDay = global.firstDay ?? day;
  const dayOffset = day - firstDay;
  const elapsedDays = previous ? Math.max(0, day - previous.lastDay) : -1;
  const elapsedSeconds = previous
    ? Math.max(0, Math.floor((input.time - previous.lastTime) / 1000))
    : -1;
  const sumDays = (previous?.sumDays ?? 0) + elapsedDays;
  const sumSeconds = (previous?.sumSeconds ?? 0) + elapsedSeconds;
  const newCards = global.newCards + Number(!previous);
  const todayNew =
    (global.today === day ? global.todayNew : 0) + Number(!previous);
  const todayReviews = global.today === day ? global.todayReviews : 0;
  const features = new Float32Array(92);
  features[0] = (log(elapsedDays) - 1.51) / 1.62;
  features[1] = (log(sumDays) - 2.14) / 2.25;
  features[2] = (log(elapsedSeconds) - 9.96) / 5.21;
  features[3] = Math.sin((2 * Math.PI * mod(elapsedSeconds, 86400)) / 86400);
  features[4] = Math.cos((2 * Math.PI * mod(elapsedSeconds, 86400)) / 86400);
  features[5] = (log(sumSeconds) - 10.86) / 5.8;
  features[6] = Math.sin((2 * Math.PI * mod(sumSeconds, 86400)) / 86400);
  features[7] = Math.cos((2 * Math.PI * mod(sumSeconds, 86400)) / 86400);
  features[8] = query
    ? 0
    : (Math.log(10 + (input.durationMs ?? 0)) - 8.9) / 1.07;
  if (!query) features[8 + input.rating] = 1;
  features[16] = Math.log(Math.log(Math.E + day - (global.previousDay ?? day)));
  features[17] = (mod(dayOffset, 7) - 3) / 3;
  features[18] =
    (Math.log(3 + (previous ? newCards - previous.lastNewCount : 0)) - 2.945) /
    2.011;
  features[19] =
    (Math.log(
      3 +
        (previous ? Math.max(0, global.reviews - previous.lastReviewIndex) : 0),
    ) -
      4.64) /
    2.59;
  features[20] = (Math.log(3 + todayNew) - 2.55) / 1.41;
  features[21] = (Math.log(3 + todayReviews) - 4.59) / 1.3;
  features[23] = Number(query);
  const ids = [input.wordId, input.language, input.wordId, "main", "main"];
  let offset = 24;
  for (const [stream, count] of [
    [0, 12],
    [2, 12],
    [1, 8],
    [3, 8],
  ] as const) {
    features.set(
      entityCode(JSON.stringify([stream, ids[stream]]), count),
      offset,
    );
    offset += count;
  }
  for (const period of [3, 7, 30, 100, 365, 3650, 36500]) {
    for (const value of [dayOffset, (previous?.firstDay ?? day) - firstDay]) {
      features[offset++] = Math.sin(
        (2 * Math.PI * mod(value, period)) / period,
      );
      features[offset++] = Math.cos(
        (2 * Math.PI * mod(value, period)) / period,
      );
    }
  }
  return {
    features,
    ids,
    card: {
      lastTime: input.time,
      lastDay: day,
      firstDay: previous?.firstDay ?? day,
      sumDays,
      sumSeconds,
      lastReviewIndex: global.reviews + 1,
      lastNewCount: newCards,
    } satisfies FeatureCard,
    global: {
      firstDay,
      previousDay: day,
      reviews: global.reviews + 1,
      newCards,
      today: day,
      todayNew,
      todayReviews: todayReviews + 1,
    } satisfies FeatureGlobal,
  };
}
