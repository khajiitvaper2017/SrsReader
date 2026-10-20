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
