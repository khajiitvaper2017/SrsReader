const articles: Record<string, Record<string, string>> = {
  de: { Masc: "der", Fem: "die", Neut: "das" },
  el: { Masc: "ο", Fem: "η", Neut: "το" },
  es: { Masc: "el", Fem: "la" },
  fr: { Masc: "le", Fem: "la" },
  nl: { Masc: "de", Fem: "de", Com: "de", Neut: "het" },
  pt: { Masc: "o", Fem: "a" },
};

export function nounArticle(
  language: string,
  gender: string | undefined,
  dictionaryGenders: readonly string[],
) {
  const forms = articles[language];
  if (!forms) return undefined;
  const parsed = gender?.split(",").filter((value) => forms[value]) ?? [];
  const selected = parsed.length ? parsed : dictionaryGenders;
  return (
    [
      ...new Set(
        Object.keys(forms)
          .filter((value) => selected.includes(value))
          .map((value) => forms[value]),
      ),
    ].join("/") || undefined
  );
}
