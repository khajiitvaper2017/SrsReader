import {
  meaningTags,
  type LookupWord,
  type Meaning,
} from "@/dictionaries/model";
import type { OccurrenceGrammar } from "@/languages/analysis";
import { t } from "@/shared/i18n/i18n";

const tagFeatures = new Map<string, [string, string[]]>(
  [
    ["UPOS", "NOUN,PROPN", "n noun"],
    ["UPOS", "PROPN", "propn proper-noun"],
    ["UPOS", "VERB,AUX", "v verb"],
    ["UPOS", "ADJ", "adj adjective"],
    ["UPOS", "ADV", "adv adverb"],
    ["UPOS", "PRON,DET", "pron pronoun"],
    ["UPOS", "DET", "det determiner"],
    ["UPOS", "ADP", "prep preposition postposition"],
    ["UPOS", "CCONJ,SCONJ", "conj conjunction"],
    ["UPOS", "NUM", "num numeral"],
    ["UPOS", "INTJ", "int interj interjection"],
    ["UPOS", "PART", "particle"],
    ["Animacy", "Anim", "anim animate"],
    ["Animacy", "Inan", "inanim inanimate"],
    ["Gender", "Masc", "m masc masculine"],
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

export function grammarConflicts(
  meaning: Meaning,
  grammar?: OccurrenceGrammar,
): Record<string, string> {
  if (!grammar || meaning.dictionaryId === "personal") return {};
  const analyses: Record<string, string>[] = grammar.group
    ? [{ ...grammar.group.feats, UPOS: "VERB" }]
    : grammar.sentence.tokens
        .filter((token) => grammar.tokenIds.includes(token.id))
        .map((token) => ({ ...token.feats, UPOS: token.upos }));
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
        !Object.keys(grammarConflicts(meaning, grammar)).length,
    )
  );
}
