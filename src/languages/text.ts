export const normalize = (text: string) =>
  text.replaceAll("\u00ad", "").normalize("NFC");

export const folded = (text: string, language: string) =>
  normalize(text).toLocaleLowerCase(language);

export const swissGermanSpelling = (text: string) => text.replaceAll("ß", "ss");

export const germanHyphenatedCompounds = (text: string) =>
  text.matchAll(
    /(?<![\p{L}\p{M}\p{N}])(?=[\p{L}\p{M}]+(?:\[(?:s|es|n|en)\])?[-‐‑])\p{L}[\p{L}\p{M}]*(?:\[(?:s|es|n|en)\])?(?:[-‐‑]\p{L}[\p{L}\p{M}]*(?:\[(?:s|es|n|en)\])?)*[-‐‑]?(?![\p{L}\p{M}\p{N}])/gu,
  );

export const hasGermanSuspensionHyphen = (term: string) => /[-‐‑]$/u.test(term);

export function joinedGermanCompound(term: string) {
  term = normalize(term);
  if (
    !/[-‐‑]/u.test(term) ||
    hasGermanSuspensionHyphen(term) ||
    germanHyphenatedCompounds(term).next().value?.[0] !== term
  )
    return;
  const joined = folded(term.replace(/[-‐‑[\]]/gu, ""), "de");
  return joined[0]!.toLocaleUpperCase("de") + joined.slice(1);
}

export const germanSuspendedLists = (text: string) =>
  text.matchAll(
    /(?<![\p{L}\p{M}\p{N}])((?:\p{L}[\p{L}\p{M}]*[-‐‑],[^\S\u2029]*)*\p{L}[\p{L}\p{M}]*[-‐‑])[^\S\u2029]+(?:und|oder|sowie)[^\S\u2029]+(\p{Lu}[\p{L}\p{M}]+)(?![\p{L}\p{M}\p{N}-])/gu,
  );

export const germanInitialAbbreviations = (text: string) =>
  text.matchAll(
    /(?<![\p{L}\p{M}\p{N}.])(?:\p{L}\.[^\S\r\n\u2029]*)+\p{L}\.(?![\p{L}\p{M}\p{N}.])/gu,
  );

export const spacedGermanAbbreviation = (term: string) =>
  [...term.matchAll(/\p{L}\./gu)].map(([initial]) => initial).join(" ");
