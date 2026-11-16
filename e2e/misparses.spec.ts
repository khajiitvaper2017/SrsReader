import { test, expect } from "@playwright/test";
import { phraseMatchesPartOfSpeech } from "../src/reader/phrase-matching";
import {
  normalizeTokens,
  occurrenceGrammar,
  type AnalysisToken,
} from "../src/languages/analysis";

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

const band: AnalysisToken = {
  id: "2",
  form: "Band",
  lemma: "Band",
  upos: "NOUN",
  xpos: "NN",
  feats: { Number: "Sing" },
  head: "0",
  deprel: "root",
  deps: "_",
  misc: {},
};

function article(form: string, Gender: string, Case: string): AnalysisToken {
  return {
    ...band,
    id: "1",
    form,
    lemma: "der",
    upos: "DET",
    xpos: "ART",
    head: band.id,
    deprel: "det",
    feats: { Gender, Case, Number: "Sing", Definite: "Def", PronType: "Art" },
  };
}

for (const [sentence, form, Gender, Case] of [
  ["Ich lese den ersten Band dieser Buchreihe.", "den", "Masc", "Acc"],
  ["Die Band spielt heute Abend ein Konzert.", "Die", "Fem", "Nom"],
  ["Das rote Band ist sehr schön.", "Das", "Neut", "Nom"],
] as const) {
  test(`${sentence} — noun inherits article agreement`, () => {
    const normalized = normalizeTokens(
      {
        metadata: { text: sentence },
        tokens: [article(form, Gender, Case), band],
      },
      "de",
    );
    const grammar = occurrenceGrammar(normalized, normalized.tokens[1]!);
    expect(grammar.sentence.tokens[1]!.feats).toEqual({
      Gender,
      Case,
      Number: "Sing",
    });
    expect(band.feats).toEqual({ Number: "Sing" });
  });
}

test("noun agreement ignores unrelated articles and preserves explicit features", () => {
  const determiner = article("den", "Masc", "Acc");
  const unrelated = normalizeTokens(
    { metadata: {}, tokens: [{ ...determiner, head: "3" }, band] },
    "de",
  );
  expect(unrelated.tokens[1]!.feats).toEqual({ Number: "Sing" });
  const explicit = {
    ...band,
    feats: { Gender: "Neut", Case: "Dat", Number: "Sing" },
  };
  const normalized = normalizeTokens(
    { metadata: {}, tokens: [determiner, explicit] },
    "de",
  );
  expect(normalized.tokens[1]!.feats).toEqual(explicit.feats);
});
