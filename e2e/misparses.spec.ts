import { test, expect } from "@playwright/test";
import { phraseMatchesPartOfSpeech } from "../src/reader/phrase-matching";
import { nounArticle } from "../src/cards/noun-article";
import { cardEncounterKey } from "../src/cards/encounter-key";
import { stateOf, stateForEncounter } from "../src/vocabulary/state";
import {
  analysisTerms,
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

function bandKey(Gender: string, Case: string) {
  return cardEncounterKey({
    context: { surface: "Band", language: "de" },
    pos: "NOUN",
    feats: { Gender, Case, Number: "Sing" },
  });
}

const volumeKey = bandKey("Masc", "Acc");
const musicKey = bandKey("Fem", "Nom");
const ribbonKey = bandKey("Neut", "Nom");
const savedVolume = {
  known: false,
  linkedCards: [
    {
      encounterKey: volumeKey,
      suspended: false,
      schedule: { state: 0, dueAt: 0, scheduledDays: 0 },
    },
  ],
};

for (const [sentence, form, Gender, Case] of [
  ["Ich lese den ersten Band dieser Buchreihe.", "den", "Masc", "Acc"],
  ["Die Band spielt heute Abend ein Konzert.", "Die", "Fem", "Nom"],
  ["Das rote Band ist sehr schön.", "Das", "Neut", "Nom"],
] as const) {
  test(`${sentence} — noun inherits article agreement`, () => {
    const start = sentence.indexOf("Band");
    const articleStart = sentence.indexOf(form);
    const parsed = {
      metadata: { text: sentence },
      tokens: [
        {
          ...article(form, Gender, Case),
          start: articleStart,
          end: articleStart + form.length,
        },
        { ...band, start, end: start + band.form.length },
      ],
    };
    const normalized = normalizeTokens(parsed, "de");
    const grammar = occurrenceGrammar(normalized, normalized.tokens[1]!);
    expect(grammar.sentence.tokens[1]!.feats).toEqual({
      Gender,
      Case,
      Number: "Sing",
    });
    expect(band.feats).toEqual({ Number: "Sing" });
    const surface = analysisTerms(
      [parsed],
      sentence,
      "0".repeat(64),
      "de",
    ).find((surface) => surface.start === start)!;
    expect(stateOf(savedVolume, 28, surface.encounterKey)).toBe(
      Gender === "Masc" ? "new" : "unknown",
    );
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

test("saving and reviewing another Band form does not merge learning states", () => {
  const savedMusic = {
    known: false,
    linkedCards: [
      ...savedVolume.linkedCards,
      {
        encounterKey: musicKey,
        suspended: false,
        schedule: {
          state: 2,
          dueAt: Number.MAX_SAFE_INTEGER,
          scheduledDays: 7,
        },
      },
    ],
  };
  expect(stateOf(savedMusic, 28, volumeKey)).toBe("new");
  expect(stateOf(savedMusic, 28, musicKey)).toBe("learning");
  expect(stateOf(savedMusic, 28, ribbonKey)).toBe("unknown");
  expect(stateOf(savedMusic, 28)).toBe("new");
  const suspended = {
    ...savedMusic,
    linkedCards: savedMusic.linkedCards.map((card) => ({
      ...card,
      suspended: card.encounterKey === volumeKey,
    })),
  };
  expect(stateOf(suspended, 28, volumeKey)).toBe("suspended");
  expect(stateOf(suspended, 28, musicKey)).toBe("learning");
});

test("live color updates and forgetting a Band card remain encounter-specific", () => {
  const update = {
    state: "new",
    encounterStates: { [volumeKey]: "learning", [musicKey]: "new" },
  } as const;
  expect(stateForEncounter(update, volumeKey)).toBe("learning");
  expect(stateForEncounter(update, musicKey)).toBe("new");
  expect(stateForEncounter(update, ribbonKey)).toBe("unknown");
  const forgotten = {
    state: "learning",
    encounterStates: { [volumeKey]: "learning" },
  } as const;
  expect(stateForEncounter(forgotten, musicKey)).toBe("unknown");
  expect(stateForEncounter(forgotten, volumeKey)).toBe("learning");
});

for (const [gender, article] of [
  ["Masc", "der"],
  ["Fem", "die"],
  ["Neut", "das"],
] as const) {
  test(`${article} Band displays its article despite mixed dictionary genders`, () => {
    expect(nounArticle("de", gender, ["Masc", "Fem", "Neut"])).toBe(article);
  });
}

test("ambiguous noun articles are displayed instead of silently omitted", () => {
  expect(nounArticle("de", undefined, ["Neut", "Fem", "Masc"])).toBe(
    "der/die/das",
  );
  expect(nounArticle("de", undefined, ["Fem"])).toBe("die");
  expect(nounArticle("de", undefined, [])).toBeUndefined();
});

test("noun articles follow the study language instead of applying German articles globally", () => {
  expect(nounArticle("es", "Fem", ["Masc", "Fem"])).toBe("la");
  expect(nounArticle("fr", "Masc", ["Masc", "Fem"])).toBe("le");
  expect(nounArticle("el", "Neut", ["Neut"])).toBe("το");
  expect(nounArticle("nl", undefined, ["Masc", "Fem"])).toBe("de");
  expect(nounArticle("en", undefined, [])).toBeUndefined();
  expect(nounArticle("cs", "Fem", ["Fem"])).toBeUndefined();
});
