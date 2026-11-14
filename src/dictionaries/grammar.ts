import {
  meaningTags,
  type LookupWord,
  type Definition,
  type Meaning,
} from "@/dictionaries/model";
import type { AnalysisToken, OccurrenceGrammar } from "@/languages/analysis";
import { t } from "@/shared/i18n/i18n";

const tagFeatures = new Map<string, [string, string[]]>(
  [
    ["UPOS", "NOUN,PROPN", "n noun s substantiv"],
    ["UPOS", "PROPN", "propn proper-noun"],
    ["UPOS", "VERB,AUX", "v verb"],
    ["UPOS", "ADJ", "adj adjective"],
    ["UPOS", "ADV", "adv adverb"],
    ["UPOS", "PRON,DET", "pron pronoun"],
    ["UPOS", "DET", "det determiner"],
    ["UPOS", "ADP", "prep preposition postposition"],
    ["UPOS", "CCONJ,SCONJ", "conj conjunction"],
    ["UPOS", "NUM", "num numeral"],
    ["UPOS", "INTJ", "int interj interjection intj"],
    ["UPOS", "PART", "particle ptkl"],
    ["Animacy", "Anim", "anim animate"],
    ["Animacy", "Inan", "inanim inanimate"],
    ["Gender", "Masc", "m masc masculine mask"],
    ["Gender", "Fem", "f fem feminine"],
    ["Gender", "Neut", "neut neuter"],
    ["Aspect", "Imp", "impf imperfective"],
    ["Aspect", "Perf", "pf perfective"],
    ["Number", "Sing", "sg singular"],
    ["Number", "Plur", "pl plural"],
    ["Case", "Nom", "nom nominative"],
    ["Case", "Gen", "gen genitive"],
    ["Case", "Dat", "dat dative"],
    ["Case", "Acc", "acc accusative"],
    ["Case", "Voc", "voc vocative"],
    ["Case", "Loc", "loc locative"],
    ["Case", "Ins", "ins instrumental"],
    ["VerbForm", "Inf", "inf infinitive"],
    ["VerbForm", "Part", "participle"],
    ["Voice", "Act", "active"],
    ["Voice", "Pass", "passive"],
    ["Tense", "Past", "past"],
    ["Tense", "Pres", "pres present"],
    ["Tense", "Fut", "fut future"],
    ["Mood", "Ind", "ind indicative"],
    ["Mood", "Cnd", "cond conditional"],
    ["Mood", "Imp", "imp imperative"],
    ["Reflex", "Yes", "vr refl reflexive"],
  ].flatMap(([feature, values, aliases]) =>
    aliases!.split(" ").map((alias) => [alias, [feature!, values!.split(",")]]),
  ),
);

export function dictionaryTagValues(
  meanings: Meaning[],
  feature: string,
): string[] {
  return [
    ...new Set(
      meanings.flatMap((meaning) =>
        meaningTags(meaning).flatMap((tag) => {
          const explicit = tag.match(/^([A-Z][\w[\]]*)=(.+)$/u);
          if (explicit)
            return explicit[1] === feature ? explicit[2]!.split(",") : [];
          const rule = tagFeatures.get(tag.toLowerCase());
          if (rule?.[0] === feature) return rule[1];
          return feature === "UPOS" && tag.toLowerCase() === "vr"
            ? ["VERB", "AUX"]
            : [];
        }),
      ),
    ),
  ];
}

export function dictionaryPartsOfSpeech(meanings: Meaning[]): string[] {
  const parts = meanings.flatMap((meaning) =>
    meaningTags(meaning).flatMap((tag) => {
      const explicit = tag.match(/^UPOS=(.+)$/u);
      if (explicit) return explicit[1]!.split(",");
      const alias = tag.toLowerCase();
      const rule = tagFeatures.get(alias);
      if (rule?.[0] !== "UPOS") return alias === "vr" ? ["VERB"] : [];
      // Matching aliases include related classes; show their broad dictionary label.
      const pos = rule[1][0]!;
      return [pos === "CCONJ" ? "CONJ" : pos];
    }),
  );
  return [...new Set(parts)]
    .map((pos) =>
      t(`sentence_grammar.pos.${pos}`, {
        defaultValue: "",
        nsSeparator: false,
      }),
    )
    .filter(Boolean);
}

function partsOfSpeechForMatching(
  token: AnalysisToken,
  forms: string[] = [],
): string[] {
  // Dictionaries can classify an adverbial negator as an adverb.
  if (
    token.upos === "PART" &&
    token.feats.Polarity === "Neg" &&
    token.deprel.split(":")[0] === "advmod"
  )
    return ["PART", "ADV"];
  // Participles can modify nouns or verbs while dictionaries define their base verb.
  if (
    /^(ADJ|ADV)$/u.test(token.upos) &&
    (token.feats.VerbForm === "Part" ||
      forms.some((form) =>
        /(?:^Partizip |^(?:present|past).*participle|Deklination|\b(?:strong|weak|mixed)\b)/iu.test(
          form,
        ),
      ))
  )
    return [token.upos, "VERB", "AUX"];
  return [token.upos];
}

export function grammarConflicts(
  meaning: Meaning,
  grammar?: OccurrenceGrammar,
  forms: string[] = [],
): Record<string, string> {
  if (!grammar || meaning.dictionaryId === "personal") return {};
  const tokens = grammar.sentence.tokens.filter((token) =>
    grammar.tokenIds.includes(token.id),
  );
  const analyses: Record<string, string>[] = grammar.group
    ? [{ ...grammar.group.feats, UPOS: "VERB" }]
    : tokens.map((token) => ({ ...token.feats, UPOS: token.upos }));
  const partsOfSpeech = grammar.group
    ? ["VERB"]
    : tokens.flatMap((token) => partsOfSpeechForMatching(token, forms));
  const rules = meaningTags(meaning).flatMap((tag) => {
    const explicit = tag.match(/^([A-Z][\w[\]]*)=(.+)$/u);
    const rule = explicit
      ? ([explicit[1]!, explicit[2]!.split(",")] as [string, string[]])
      : tagFeatures.get(tag.toLowerCase());
    return rule
      ? [
          { tag, feature: rule[0], values: rule[1] },
          ...(tag.toLowerCase() === "vr"
            ? [{ tag, feature: "UPOS", values: ["VERB", "AUX"] }]
            : []),
        ]
      : [];
  });
  const conflicts: Record<string, string> = {};
  for (const { tag, feature } of rules) {
    const allowed = rules
      .filter((rule) => rule.feature === feature)
      .flatMap((rule) => rule.values);
    if (
      !analyses.length ||
      (feature === "UPOS" &&
        (grammar.splitAbbreviation ||
          partsOfSpeech.some((pos) => allowed.includes(pos)))) ||
      analyses.some(
        (analysis) =>
          !analysis[feature] ||
          analysis[feature]!.split(",").some((value) =>
            allowed.includes(value),
          ),
      )
    )
      continue;
    const label = (value: string) =>
      t(
        `sentence_grammar.${feature === "UPOS" ? "pos" : `values.${feature}`}.${value}`,
        {
          defaultValue: value,
          nsSeparator: false,
        },
      );
    conflicts[tag] = t("dictionary_grammar_conflict", {
      feature: t(`sentence_grammar.features.${feature}`, {
        defaultValue: feature,
        nsSeparator: false,
      }),
      dictionary: [...new Set(allowed)].map(label).join(" / "),
      parser: [
        ...new Set(
          analyses.flatMap((analysis) => analysis[feature]!.split(",")),
        ),
      ]
        .map(label)
        .join(" / "),
    });
  }
  return conflicts;
}

export function filterPrepositionSenses(
  meaning: Meaning,
  grammar?: OccurrenceGrammar,
): Meaning {
  if (!meaningsMatchPartOfSpeech([meaning], grammar)) return meaning;
  const cases = grammar?.sentence.tokens
    .filter(
      (token) => grammar.tokenIds.includes(token.id) && token.upos === "ADP",
    )
    .flatMap((token) => token.feats.Case?.split(",") || []);
  if (!cases?.length || meaning.dictionaryId === "personal") return meaning;
  const caseNames: Record<string, string> = {
    nominativ: "Nom",
    nominative: "Nom",
    genitiv: "Gen",
    genitive: "Gen",
    dativ: "Dat",
    dative: "Dat",
    akuzativ: "Acc",
    accusative: "Acc",
    vokativ: "Voc",
    vocative: "Voc",
    lokál: "Loc",
    locative: "Loc",
    instrumentál: "Ins",
    instrumental: "Ins",
  };
  function text(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(text).join("");
    if (!value || typeof value !== "object") return "";
    const node = value as Record<string, unknown>;
    return node.tag === "details" ? "" : text(node.content || node.text);
  }
  function matchesCase(sense: unknown) {
    // Only leading case labels describe government; examples can use other cases.
    const labels = text(sense).match(/^(?:\s*\([^)]*\)[\s,]*)+/u)?.[0] || "";
    const allowed = [...labels.toLowerCase().matchAll(/\p{L}+/gu)].flatMap(
      ([name]) => (caseNames[name] ? [caseNames[name]] : []),
    );
    return !allowed.length || cases!.some((value) => allowed.includes(value));
  }
  let changed = false;
  function filter(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(filter);
    if (!value || typeof value !== "object") return value;
    const node = value as Record<string, unknown>;
    if (
      node.tag === "ol" &&
      (node.data as Record<string, unknown> | undefined)?.content ===
        "glosses" &&
      Array.isArray(node.content)
    ) {
      const content = node.content.filter(matchesCase);
      if (content.length !== node.content.length) changed = true;
      return { ...node, content: content.map(filter) };
    }
    return { ...node, content: filter(node.content) };
  }
  const senses =
    meaning.dictionaryId === "nechybujte"
      ? meaning.definitions.filter(matchesCase)
      : meaning.definitions;
  if (senses.length !== meaning.definitions.length) changed = true;
  const definitions = senses.map(filter) as Definition[];
  return changed ? { ...meaning, definitions } : meaning;
}

export function dictionaryGrammarTags(
  grammar: OccurrenceGrammar | undefined,
  available: { name: string; description: string }[],
): Pick<Meaning, "tags" | "tagDescriptions"> {
  const analyses = !grammar
    ? []
    : grammar.group
      ? [{ ...grammar.group.feats, UPOS: "VERB" }]
      : grammar.sentence.tokens
          .filter((token) => grammar.tokenIds.includes(token.id))
          .map((token) => ({ ...token.feats, UPOS: token.upos }));
  const selected = new Map<string, { name: string; description: string }>();
  const lexical = ["UPOS", "Animacy", "Gender", "Aspect", "Reflex"];
  // Save lexical properties; inflection belongs to the occurrence, not the lemma.
  for (const [alias, [feature, values]] of [...tagFeatures].sort(
    (a, b) => a[1][1].length - b[1][1].length,
  )) {
    if (!lexical.includes(feature) || selected.has(feature)) continue;
    const tag = available.find((tag) => tag.name.toLowerCase() === alias);
    if (
      tag &&
      analyses.some(
        (analysis: Record<string, string>) =>
          (alias !== "vr" || /^(VERB|AUX)$/u.test(analysis.UPOS || "")) &&
          (!/^(Gender|Animacy)$/u.test(feature) ||
            /^(NOUN|PROPN)$/u.test(analysis.UPOS || "")) &&
          analysis[feature]?.split(",").some((value) => values.includes(value)),
      )
    )
      selected.set(feature, tag);
  }
  const tags = lexical.flatMap((feature) =>
    selected.has(feature) ? [selected.get(feature)!] : [],
  );
  return {
    tags: tags.map((tag) => tag.name).join(" "),
    tagDescriptions: Object.fromEntries(
      tags.map((tag) => [tag.name, tag.description]),
    ),
  };
}

export function wordMatchesGrammar(
  word: LookupWord,
  grammar?: OccurrenceGrammar,
  expandedDictionaries: string[] = [],
) {
  return (
    !word.meanings.length ||
    word.meanings.some(
      (meaning) =>
        expandedDictionaries.includes(meaning.dictionaryId) ||
        !Object.keys(grammarConflicts(meaning, grammar, word.forms)).length,
    )
  );
}

export function meaningsMatchPartOfSpeech(
  meanings: Meaning[],
  grammar?: OccurrenceGrammar,
  forms: string[] = [],
) {
  const expected = new Set(
    meanings.flatMap((meaning) =>
      meaningTags(meaning).flatMap((tag) => {
        const explicit = tag.match(/^UPOS=(.+)$/u);
        if (explicit) return explicit[1]!.split(",");
        const rule = tagFeatures.get(tag.toLowerCase());
        if (rule?.[0] === "UPOS") return rule[1];
        return tag.toLowerCase() === "vr" ? ["VERB", "AUX"] : [];
      }),
    ),
  );
  if (!grammar || !expected.size) return true;
  const parsed = grammar.group
    ? ["VERB"]
    : grammar.sentence.tokens
        .filter((token) => grammar.tokenIds.includes(token.id))
        .flatMap((token) => partsOfSpeechForMatching(token, forms));
  return (
    !parsed.length ||
    parsed.some((pos) => !pos || pos === "_" || expected.has(pos))
  );
}
