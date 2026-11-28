import { folded, normalize } from "@/languages/text";

export const isFrequencyWord = (term: string) => /\p{L}/u.test(term);

export function frequencyHeadwordRank(
  term: string,
  lemma: string,
  language: string,
) {
  if (!isFrequencyWord(lemma)) return;
  if (normalize(lemma) === normalize(term)) return 0;
  if (folded(lemma, language) !== folded(term, language)) return;
  // Some frequency lists fold nouns. The articles also have unrelated cased headwords.
  if (
    language === "de" &&
    /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)$/u.test(term)
  )
    return;
  return 1;
}
