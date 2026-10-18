import { folded } from "./model";
import { czechRules } from "./parsing-rules/cs";
import type { ParsingCandidate, ParsingRule } from "./parsing-rules/types";

export type { ParsingCandidate } from "./parsing-rules/types";

const rulesByLanguage: Record<string, Record<string, ParsingRule>> = {
  cs: czechRules,
};

export function parsingCandidates(
  term: string,
  language: string,
): ParsingCandidate[] {
  const rules = rulesByLanguage[language];
  if (!rules) return [];
  const word = folded(term, language);

  return Object.values(rules).flatMap(
    ({ pattern, replacement, ...candidate }) =>
      pattern.test(word)
        ? [{ ...candidate, term: word.replace(pattern, replacement) }]
        : [],
  );
}
