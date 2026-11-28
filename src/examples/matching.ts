import { folded, normalize } from "@/languages/text";

export function exampleFormRank(
  sentence: string,
  start: number,
  end: number,
  lemma: string,
  language: string,
  verifiedInflection = false,
) {
  const surface = sentence.slice(start, end);
  if (
    start < 0 ||
    end > sentence.length ||
    !surface ||
    /[\p{L}\p{M}\p{N}_]$/u.test(sentence.slice(0, start)) ||
    /^[\p{L}\p{M}\p{N}_]/u.test(sentence.slice(end)) ||
    (language === "de" && /^\p{Lu}/u.test(lemma) && !/^\p{Lu}/u.test(surface))
  )
    return;
  if (normalize(surface) === normalize(lemma)) return 0;
  if (folded(surface, language) === folded(lemma, language))
    return language === "de" ? 1 : 0;
  if (verifiedInflection) return 2;
}
