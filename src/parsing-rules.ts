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

  const candidates: ParsingCandidate[] = [];
  if (/^za\p{L}{2,}$/u.test(word))
    candidates.push({
      term: word.slice(2),
      forms: [word, "za-"],
      verbOnly: true,
    });
  if (/^z\p{L}{2,}$/u.test(word))
    candidates.push({ term: word.slice(1), forms: ["z-"], verbOnly: true });
  return candidates;
}
