import { folded } from "./model";

export type ParsingCandidate = {
  term: string;
  forms: string[];
  verbOnly?: boolean;
};

export function parsingCandidates(
  term: string,
  language: string,
): ParsingCandidate[] {
  if (language !== "cs") return [];
  const word = folded(term, language);

  return /^z\p{L}{2,}$/u.test(word)
    ? [{ term: word.slice(1), forms: ["z-"], verbOnly: true }]
    : [];
}
