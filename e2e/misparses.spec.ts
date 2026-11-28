import { test, expect } from "@playwright/test";
import { displayedWords } from "../src/dictionaries/display";
import { phraseMatchesPartOfSpeech } from "../src/reader/phrase-matching";
import { ankiFieldText } from "../src/anki/field-text";
import { germanNounField, nounArticle } from "../src/cards/noun-article";
import { filterReflexiveSenses } from "../src/cards/reflexive-senses";
import { germanReflexiveBase } from "../src/languages/text";
import { exampleFormRank } from "../src/examples/matching";
import { frequencyHeadwordRank } from "../src/srs/frequency-headword";

import { cardEncounterKey } from "../src/cards/encounter-key";
import { stateOf, stateForEncounter } from "../src/vocabulary/state";
import {
  ipaDataSchema,
  ipaDefinitions,
  type Meaning,
} from "../src/dictionaries/model";
import {
  dictionaryPronunciations,
  preferredIpaMeanings,
} from "../src/dictionaries/pronunciation";
import {
  analysisTerms,
  normalizeTokens,
  occurrenceGrammar,
  type AnalysisToken,
} from "../src/languages/analysis";

test("review examples require the whole word and prefer the card's exact form", () => {
  const rank = (
    sentence: string,
    surface: string,
    lemma: string,
    verified = false,
  ) => {
    const start = sentence.indexOf(surface);
    return exampleFormRank(
      sentence,
      start,
      start + surface.length,
      lemma,
      "de",
      verified,
    );
  };
  expect(rank("400 g (CHF 0.30/100 g)", "g", "Gesetz")).toBeUndefined();
  expect(
    rank("»Es ist rührend, Eddie«, sagte er.", "die", "Die", true),
  ).toBeUndefined();
  expect(
    rank("Wir sind nicht die Einzigen.", "die", "Die", true),
  ).toBeUndefined();
  expect(
    rank(
      "Deutsche Firmen können die Teile herstellen.",
      "herstellen",
      "herstellen",
    ),
  ).toBe(0);
  expect(
    rank(
      "Firmen haben beim Herstellen mitgeholfen.",
      "Herstellen",
      "herstellen",
    ),
  ).toBe(1);
  expect(
    rank("Das gilt für alle neuen Gesetze.", "Gesetze", "Gesetz", true),
  ).toBe(2);
});

test("frequency entries distinguish the article die from the noun Die", () => {
  expect(frequencyHeadwordRank("die", "Die", "de")).toBeUndefined();
  expect(frequencyHeadwordRank("die", "die", "de")).toBe(0);
  expect(frequencyHeadwordRank("Die", "Die", "de")).toBe(0);
  expect(frequencyHeadwordRank("hund", "Hund", "de")).toBe(1);
});

test("Anki field markup preserves German reflexive infinitives", () => {
  expect(ankiFieldText("<div>sich</div><div>hinlegen</div>")).toBe(
    "sich hinlegen",
  );
  expect(ankiFieldText("sich<br>erinnern[sound:word.mp3]")).toBe(
    "sich erinnern",
  );
  expect(germanReflexiveBase("de", "sich hinlegen")).toBe("hinlegen");
  expect(germanReflexiveBase("de", "sich erinnern")).toBe("erinnern");
});

test("sich leisten prefers the reflexive Wiktionary gloss when present", () => {
  const sense = (tag: string, gloss: string) =>
    `<li><div><div data-sc-content="tags"><span data-sc-content="tag">${tag}</span></div>${gloss}</div></li>`;
  const ordinary = sense("vt", "to perform") + sense("vt", "to provide");
  const reflexive = sense("vr", "to afford");
  const glossary = (senses: string) =>
    `<ol data-sc-content="glosses">${senses}</ol>`;
  expect(filterReflexiveSenses(glossary(ordinary + reflexive))).toBe(
    glossary(reflexive),
  );
  expect(filterReflexiveSenses(glossary(ordinary))).toBe(glossary(ordinary));
});

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

test("Wird Lernen als ein Prozess definiert? → Lernen", () => {
  const text = "Wird Lernen als ein Prozess definiert?";
  const token = { ...band, form: "Lernen", lemma: "lernen", start: 5, end: 11 };
  const [surface] = analysisTerms(
    [{ metadata: { text }, tokens: [token] }],
    text,
    "0".repeat(64),
    "de",
  );
  expect(surface?.terms).toEqual(["Lernen"]);
});

test("groß with an imported IPA reading keeps its card and dictionary definition", () => {
  const lemma = "groß";
  const general = {
    id: "dictionary",
    language: "de",
    lemma,
    reading: "",
    forms: ["comparative"],
    meanings: [
      {
        dictionaryId: "de-en",
        title: "German",
        revision: "1",
        attribution: "",
        sourceUrl: "",
        tags: "",
        definitions: ["large"],
      },
    ],
  };
  const reading = "/ɡʁoːs/";
  const card = {
    ...general,
    id: "imported",
    reading,
    forms: [],
    meanings: [],
  };
  const other = {
    ...general,
    id: "homograph",
    reading: "other",
  };
  const saved = new Map([[card.id, true]]);
  const lookup = () =>
    displayedWords(
      [card, general, other],
      { dictionaryPreferences: {}, nechybujte: false },
      [],
      [lemma],
      saved,
    );
  expect(lookup()).toEqual([
    { ...card, meanings: general.meanings, forms: general.forms },
    other,
  ]);
  saved.set(general.id, true);
  expect(lookup().map((word) => word.id)).toEqual([
    card.id,
    general.id,
    other.id,
  ]);
  expect(dictionaryPronunciations([], reading)).toEqual([reading]);
  expect(dictionaryPronunciations([], "かな")).toEqual([]);
});

test("Anki nouns match reading encounters using the article's gender", () => {
  expect(germanNounField("der Bullshit")).toEqual({
    lemma: "Bullshit",
    gender: "Masc",
  });
  expect(germanNounField("die beste Lösung")).toEqual({
    lemma: "die beste Lösung",
  });
  const importedCards = [
    { importedGenders: ["Fem"], suspended: false, schedule: null },
  ];
  const word = { known: false, linkedCards: importedCards };
  expect(stateOf(word, 28, musicKey)).toBe("new");
  expect(stateOf(word, 28, ribbonKey)).toBe("unknown");
  expect(
    stateForEncounter(
      { state: "new", encounterStates: {}, nonEncounterCards: importedCards },
      musicKey,
      28,
    ),
  ).toBe("new");
  expect(
    stateOf(
      {
        known: false,
        linkedCards: [{ ...importedCards[0]!, importedGenders: [] }],
      },
      28,
      ribbonKey,
    ),
  ).toBe("new");
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

test("merged IPA entries preserve transcriptions and dialect or context labels", () => {
  const data = ipaDataSchema.parse({
    reading: "'n",
    transcriptions: [
      { ipa: "/n̩/" },
      { ipa: "/m̩/", tags: ["often", "before a labial"] },
    ],
  });
  const definitions = ipaDefinitions(data) as {
    content: { content: string };
  }[];
  expect(definitions.map((definition) => definition.content.content)).toEqual([
    "/n̩/",
    "/m̩/ (often, before a labial)",
  ]);
  expect(
    ipaDataSchema.safeParse({
      reading: "'n",
      transcriptions: [{ ipa: 5 }],
    }).success,
  ).toBe(false);
});

test("merged IPA displays only its first pronunciation even when another source exists", () => {
  const meaning = (ipas: string[]): Meaning => ({
    dictionaryId: "ipa",
    title: "IPA",
    revision: "1",
    attribution: "",
    sourceUrl: "",
    tags: "ipa",
    definitions: ipaDefinitions({
      reading: "",
      transcriptions: ipas.map((ipa) => ({ ipa })),
    }),
  });
  for (const [headword, merged] of [
    [
      "[hɛɐ̯ˈfoːɐ̯ˌbʁɪŋən]",
      [
        "[hɛɐ̯ˈfoːɐ̯ˌbʀɪŋən]",
        "[hɛɐ̯ˈfoːɐ̯ˌbʁɪŋən]",
        "/ˌbʀaχtə hɛɐ̯ˈfoːɐ̯/",
        "/hɛɐ̯ˈfoːɐ̯ɡəˌbʀaχt/",
      ],
    ],
    ["[ˈʃpʁɛçn̩]", ["/ˈʃprɛçən/", "[-çn̩]", "/'ʃpra:x/", "/gə'ʃpro:xən/"]],
  ] as const) {
    const selected = preferredIpaMeanings([
      { merged: true, meanings: [meaning([...merged])] },
      { merged: false, meanings: [meaning([headword])] },
    ]);
    expect(dictionaryPronunciations(selected)).toEqual([merged[0]]);
  }
});

test("IPA displays only its first pronunciation with its dictionary explanation", () => {
  const meanings: Meaning[] = [
    {
      dictionaryId: "ipa",
      title: "IPA",
      revision: "1",
      attribution: "",
      sourceUrl: "",
      tags: "ipa",
      definitions: ipaDefinitions(
        {
          reading: "Garage",
          transcriptions: [
            { ipa: "[ɡaˈʁaːʒə]", tags: ["🇩🇪"] },
            { ipa: "[ɡaˈʁaːʒə]", tags: ["🇩🇪"] },
            { ipa: "[ɡaˈʁaːʃ]", tags: ["🇦🇹"] },
          ],
        },
        { "🇩🇪": "Germany", "🇦🇹": "Austria" },
      ),
    },
  ];
  expect(dictionaryPronunciations(meanings)).toEqual(["[ɡaˈʁaːʒə] (Germany)"]);
});
