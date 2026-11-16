import { z } from "zod";
import { cardEncounterKey, grammarFeatures } from "@/cards/encounter-key";

export const occurrenceSchema = z.object({
  key: z.string().length(64),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  phrases: z.array(z.string().max(1000)).optional(),
});
export type Occurrence = z.infer<typeof occurrenceSchema>;

export type AnalysisToken = {
  id: string;
  form: string;
  lemma: string;
  upos: string;
  xpos: string;
  feats: Record<string, string>;
  head: string;
  deprel: string;
  deps: string;
  misc: Record<string, string>;
  start?: number;
  end?: number;
};
export type AnalysisSentence = {
  metadata: Record<string, string>;
  tokens: AnalysisToken[];
};
export type SurfaceAnalysis = {
  start: number;
  end: number;
  terms: string[];
  partsOfSpeech: string[];
  encounterKey: string;
  properName: boolean;
  occurrence: Occurrence;
  related?: { start: number; end: number }[];
};
export type TextAnalysis = {
  sentences: AnalysisSentence[];
  surfaces: SurfaceAnalysis[];
};
export type OccurrenceGrammar = {
  splitAbbreviation?: boolean;
  sentence: AnalysisSentence;
  tokenIds: string[];
  group?: {
    form: string;
    lemma: string;
    feats: Record<string, string>;
    tokenIds: string[];
  };
};
export type AnalysisRecord = {
  key: string;
  language?: string;
  text: string;
  analysis?: TextAnalysis;
  retryAt?: number;
};

function reflexive(token: AnalysisToken) {
  return token.deprel === "expl:pv" && /^(se|si)$/iu.test(token.form);
}

function componentsOf(token: AnalysisToken, tokens: AnalysisToken[]) {
  if (!token.id.includes("-")) return [token];
  const [first, last] = token.id.split("-").map(Number);
  return tokens.filter(
    (part) => /^\d+$/u.test(part.id) && +part.id >= first! && +part.id <= last!,
  );
}

function predicateOf(token: AnalysisToken, tokens: AnalysisToken[]) {
  const seen = new Set<string>();
  while (/^aux(?::pass)?$/u.test(token.deprel) || reflexive(token)) {
    if (seen.has(token.id)) break;
    seen.add(token.id);
    const parent = tokens.find((part) => part.id === token.head);
    if (!parent) break;
    if (!/^(VERB|AUX)$/u.test(parent.upos)) {
      // In a past copular clause, auxiliaries attach to the nominal predicate.
      const copula = tokens.find(
        (part) => part.head === parent.id && part.deprel === "cop",
      );
      if (copula) return copula;
      if (parent.feats.VerbForm !== "Part") break;
    }
    token = parent;
  }
  return token;
}

function predicateTerms(predicate: AnalysisToken, tokens: AnalysisToken[]) {
  const clitic = tokens.find(
    (part) => part.head === predicate.id && reflexive(part),
  );
  return [
    ...(clitic && /^(VERB|AUX)$/u.test(predicate.upos)
      ? [`${predicate.lemma} ${clitic.form.toLocaleLowerCase("cs")}`]
      : []),
    ...(predicate.lemma === "_" ? [] : [predicate.lemma]),
  ];
}

function constructionHead(token: AnalysisToken, tokens: AnalysisToken[]) {
  return token.deprel === "expl:pass"
    ? tokens.find((part) => part.id === token.head) || token
    : predicateOf(token, tokens);
}

function constructionGroups(tokens: AnalysisToken[]) {
  const groups = new Map<string, AnalysisToken[]>();
  for (const token of tokens) {
    if (!/^\d+$/u.test(token.id)) continue;
    const head = constructionHead(token, tokens);
    const group = groups.get(head.id) || [];
    group.push(token);
    groups.set(head.id, group);
  }
  return groups;
}

export function occurrenceGrammar(
  sentence: AnalysisSentence,
  token: AnalysisToken,
): OccurrenceGrammar {
  const { tokens } = sentence;
  const components = componentsOf(token, tokens);
  const grammar: OccurrenceGrammar = {
    sentence,
    tokenIds: components.map((part) => part.id),
  };
  // A contraction retains separate component analyses, not one invented lemma.
  if (components.length !== 1) return grammar;
  const predicate = constructionHead(token, tokens);
  if (
    !/^(VERB|AUX)$/u.test(predicate.upos) &&
    predicate.feats.VerbForm !== "Part"
  )
    return grammar;
  const group = constructionGroups(tokens).get(predicate.id)!;
  if (group.length < 2) return grammar;
  const feats = { ...predicate.feats };
  const auxiliaries = group.filter((part) =>
    /^aux(?::pass)?$/u.test(part.deprel),
  );
  const finite = auxiliaries.find((part) => part.feats.VerbForm === "Fin");
  if (finite) {
    for (const feature of ["Person", "Number", "Mood", "VerbForm"])
      if (finite.feats[feature]) feats[feature] = finite.feats[feature]!;
  }
  if (auxiliaries.some((part) => part.feats.Mood === "Cnd")) {
    feats.Mood = "Cnd";
    // An l-participle alone does not make a present conditional a past tense.
    if (!auxiliaries.some((part) => part.feats.Tense === "Past"))
      delete feats.Tense;
    else feats.Tense = "Past";
  } else {
    const tense =
      auxiliaries.find((part) => part.feats.Tense === "Fut")?.feats.Tense ||
      (predicate.feats.Tense === "Past" ? "Past" : undefined) ||
      auxiliaries.find((part) => part.feats.Tense === "Past")?.feats.Tense ||
      finite?.feats.Tense;
    if (tense) feats.Tense = tense;
  }
  if (group.some((part) => /^(aux|expl):pass$/u.test(part.deprel)))
    feats.Voice = "Pass";
  if (group.some(reflexive)) feats.Reflex = "Yes";
  if (group.some((part) => part.feats.Polarity === "Neg"))
    feats.Polarity = "Neg";
  grammar.group = {
    form: group.map((part) => part.form).join(" "),
    lemma: predicateTerms(predicate, tokens)[0]!,
    feats,
    tokenIds: group.map((part) => part.id),
  };
  return grammar;
}

export function normalizeTokens(
  sentence: AnalysisSentence,
  language: string | undefined,
): AnalysisSentence {
  const determiners = new Map<string, AnalysisToken>();
  if (language === "de")
    for (const token of sentence.tokens)
      if (token.upos === "DET" && token.deprel === "det")
        determiners.set(token.head, token);
  return {
    ...sentence,
    tokens: sentence.tokens.map((token, index) => {
      const quotes = /^["“”„‟«»]+|["“”„‟«»]+$/gu;
      let form = token.form.replace(quotes, "");
      let lemma = token.lemma.replace(quotes, "");
      if (language === "de") {
        const punctuation = /^[‘’‚‛]+|[‘’‚‛!?]+$/gu;
        form = form.replace(punctuation, "");
        lemma = lemma.replace(punctuation, "");
      }
      const previous = sentence.tokens[index - 1];
      if (
        token.start !== undefined &&
        previous?.end === token.start &&
        /\p{L}$/u.test(previous.form)
      ) {
        form = form.replace(/^[-‐‑]+(?=\p{L})/u, "");
        lemma = lemma.replace(/^[-‐‑]+(?=\p{L})/u, "");
      }
      if (
        language === "de" &&
        (token.upos === "NOUN" || token.upos === "PROPN") &&
        /[-‐‑]/u.test(form)
      ) {
        lemma = form
          .toLocaleLowerCase("de")
          .startsWith(lemma.toLocaleLowerCase("de"))
          ? form.slice(0, lemma.length)
          : form;
      }
      let feats = token.feats;
      const determiner =
        token.upos === "NOUN" || token.upos === "PROPN"
          ? determiners.get(token.id)
          : undefined;
      // HDT may put noun agreement only on its linked determiner.
      if (determiner)
        for (const feature of ["Gender", "Case", "Number"]) {
          const value = determiner.feats[feature];
          if (!feats[feature] && value) {
            if (feats === token.feats) feats = { ...feats };
            feats[feature] = value;
          }
        }
      if (
        !form ||
        (form === token.form && lemma === token.lemma && feats === token.feats)
      )
        return token;
      const start =
        token.start === undefined
          ? undefined
          : token.start + token.form.indexOf(form);
      return {
        ...token,
        form,
        lemma,
        feats,
        start,
        end: start === undefined ? undefined : start + form.length,
      };
    }),
  };
}

export function analysisTerms(
  sentences: AnalysisSentence[],
  text: string,
  key: string,
  language: string | undefined,
): SurfaceAnalysis[] {
  return sentences.flatMap((sentence) => {
    const normalized = normalizeTokens(sentence, language);
    const { tokens } = normalized;
    const multiwords = tokens.filter((token) => token.id.includes("-"));
    const groups = constructionGroups(tokens);
    return tokens.flatMap((token) => {
      if (token.start === undefined || token.end === undefined) return [];
      if (token.id.includes(".")) return [];
      const components = componentsOf(token, tokens);
      if (
        !token.id.includes("-") &&
        multiwords.some((multiword) => {
          const [first, last] = multiword.id.split("-").map(Number);
          return +token.id >= first! && +token.id <= last!;
        })
      )
        return [];
      if (!/[\p{L}\p{M}\p{N}]/u.test(token.form)) return [];
      const terms: string[] = [];
      for (const part of components) {
        terms.push(...predicateTerms(predicateOf(part, tokens), tokens));
        if (part.lemma !== "_") terms.push(part.lemma);
      }
      const surface = text.slice(token.start, token.end);
      terms.push(surface);
      const related = new Set(
        components
          .flatMap(
            (part) => groups.get(constructionHead(part, tokens).id) || [],
          )
          .map((part) =>
            part.start === undefined
              ? multiwords.find((multiword) =>
                  componentsOf(multiword, tokens).includes(part),
                )
              : part,
          ),
      );
      const ranges = [...related].flatMap((part) =>
        part?.start !== undefined && part.end !== undefined
          ? [{ start: part.start, end: part.end }]
          : [],
      );
      return [
        {
          start: token.start,
          end: token.end,
          terms: [...new Set(terms)],
          partsOfSpeech: components.flatMap((part) => [
            predicateOf(part, tokens).upos,
            ...(part.feats.VerbForm === "Part" ? ["VERB", "AUX"] : []),
          ]),
          encounterKey: cardEncounterKey({
            context: { surface, language },
            ...grammarFeatures(occurrenceGrammar(normalized, token)),
          }),
          properName: components.some(
            (part) =>
              !part.feats.NameType?.split(",").includes("Nat") &&
              (part.upos === "PROPN" || !!part.feats.NameType),
          ),
          occurrence: { key, start: token.start, end: token.end },
          related: ranges.length > 1 ? ranges : undefined,
        },
      ];
    });
  });
}
