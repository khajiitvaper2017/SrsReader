import { test, expect } from "@playwright/test";
import { phraseMatchesPartOfSpeech } from "../src/reader/phrase-matching";

const examples = [
  [
    "15 Sprachen mit rund 500 Millionen Muttersprachlern ≠ mitsprechen",
    ["NOUN", "ADP"],
    ["VERB", "AUX"],
    true,
    false,
  ],
  [
    "Wir sprachen mit. → mitsprechen",
    ["VERB", "PART"],
    ["VERB", "AUX"],
    true,
    true,
  ],
  [
    "die Vereinigten Staaten → Vereinigte Staaten",
    ["ADJ", "NOUN"],
    ["NOUN", "PROPN"],
    true,
    true,
  ],
  [
    "auf jeden Fall remains a genuine phrase",
    ["ADP", "DET", "NOUN"],
    ["ADV"],
    false,
    true,
  ],
  [
    "no parser result preserves dictionary fallback",
    undefined,
    ["VERB"],
    true,
    true,
  ],
] as const;

for (const [sentence, parsed, expected, inflected, matches] of examples) {
  test(sentence, () => {
    expect(phraseMatchesPartOfSpeech(parsed, expected, inflected)).toBe(
      matches,
    );
  });
}
