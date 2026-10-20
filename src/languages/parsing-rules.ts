import { czechRules } from "@/languages/parsing-rules/cs";
import type {
  ParsingCandidate,
  ParsingRule,
} from "@/languages/parsing-rules/types";
import { folded } from "@/languages/text";

export type { ParsingCandidate } from "@/languages/parsing-rules/types";

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
