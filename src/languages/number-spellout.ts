import type { RuleBasedNumberFormat } from "@pointnet/cldr-spellout";
import type * as SpelloutRuntime from "@pointnet/cldr-spellout";
import type { OccurrenceGrammar } from "@/languages/analysis";
import { icuLanguage } from "@/languages/codes";
import {
  parseNumeral,
  type NumeralLookup,
  type NumeralReading,
} from "@/languages/numerals";
import { folded, normalize } from "@/languages/text";

let runtime: typeof SpelloutRuntime | undefined;
const formatters = new Map<
  string,
  { formatter: RuleBasedNumberFormat; rules: Set<string> }
>();
const ordinalRules = [
  "%spellout-ordinal",
  "%spellout-ordinal-common",
  "%spellout-ordinal-masculine",
  "%spellout-ordinal-neuter",
  "%spellout-ordinal-feminine",
  "%spellout-ordinal-sinokorean",
  "%spellout-ordinal-native",
];
const genders: Record<string, string> = {
  Fem: "feminine",
  Masc: "masculine",
  Neut: "neuter",
  Com: "common",
};

const dateHeadwords = new Map<string, Set<string>>();

function dateHeads(language: string) {
  const cached = dateHeadwords.get(language);
  if (cached) return cached;
  const names = new Set<string>();
  if (Intl.DateTimeFormat.supportedLocalesOf(language).length) {
    const year = new Intl.DisplayNames([language], {
      type: "dateTimeField",
    }).of("year");
    if (year) names.add(folded(year, language).replace(/\.$/u, ""));
    for (const month of ["long", "short"] as const) {
      for (const day of [undefined, "numeric"] as const) {
        const formatter = new Intl.DateTimeFormat(language, {
          month,
          day,
          timeZone: "UTC",
        });
        for (let index = 0; index < 12; index++) {
          const name = formatter
            .formatToParts(new Date(Date.UTC(2000, index, 15)))
            .find((part) => part.type === "month")?.value;
          if (name) names.add(folded(name, language).replace(/\.$/u, ""));
        }
      }
    }
  }
  dateHeadwords.set(language, names);
  return names;
}

function ordinalSurface(surface: string, language: string) {
  return folded(surface, language)
    .trim()
    .replace(/[ \u00a0\u202f]/gu, " ")
    .replace(
      /\p{Nd}/gu,
      (digit) => parseNumeral(digit, language)?.canonical ?? digit,
    );
}

export async function numberSpellout(
  surface: string,
  language: string,
  grammar?: OccurrenceGrammar,
): Promise<NumeralLookup | undefined> {
  const locale = icuLanguage(language);
  if (!locale || !/\p{Nd}/u.test(surface)) return;
  let input = parseNumeral(surface, language);
  if (!input && surface.trimEnd().endsWith("."))
    input = parseNumeral(surface.trimEnd().slice(0, -1), language);
  const cores = !input
    ? [
        ...normalize(surface).matchAll(
          /\p{Nd}(?:[\p{Nd}.,٬٫'’ \u00a0\u202f]*\p{Nd})?/gu,
        ),
      ]
    : [];
  const core =
    cores.length === 1 ? parseNumeral(cores[0]![0], language) : undefined;
  if (!input && (!core || core.value <= 0 || !Number.isInteger(core.value)))
    return;
  // Keep all CLDR datasets out of settings/reader bundles and nonnumeric lookups.
  runtime ??= await import("@pointnet/cldr-spellout");
  let cached = formatters.get(locale);
  if (!cached) {
    const formatter = runtime.RuleBasedNumberFormat.fromLocale(locale);
    cached = { formatter, rules: new Set(formatter.getRuleSetNames()) };
    formatters.set(locale, cached);
  }
  const { formatter, rules } = cached;
  let affixedOrdinal = false;
  if (!input && core) {
    const selected = ordinalSurface(surface, language);
    affixedOrdinal = [...rules].some((rule) => {
      if (!rule.startsWith("%digits-ordinal")) return false;
      const generated = ordinalSurface(
        formatter.format(core.value, rule),
        language,
      );
      return (
        generated === selected &&
        generated !== ordinalSurface(cores[0]![0], language)
      );
    });
    if (!affixedOrdinal) return;
    input = core;
  }
  if (!input) return;
  const value = input.value;
  const tokens =
    grammar?.sentence.tokens.filter((token) =>
      grammar.tokenIds.includes(token.id),
    ) ?? [];
  const temporal = tokens.some((token) => {
    const head = grammar?.sentence.tokens.find(
      (head) => head.id === token.head,
    );
    if (
      [token, head].some((part) =>
        part?.deprel.split(":").slice(1).includes("tmod"),
      )
    )
      return true;
    // HDT uses nmod for years attached to a month or "Jahr", without :tmod.
    return (
      value >= 1000 &&
      value <= 9999 &&
      Number.isInteger(value) &&
      /^(nmod|nummod|appos)(:|$)/u.test(token.deprel) &&
      !!head &&
      /^(NOUN|PROPN)$/u.test(head.upos) &&
      [head.lemma, head.form].some((text) =>
        dateHeads(locale).has(folded(text, locale).replace(/\.$/u, "")),
      )
    );
  });
  const ordinal =
    affixedOrdinal ||
    tokens.some(
      (token) =>
        token.feats.NumType?.split(",").includes("Ord") ||
        // German HDT tags written digit ordinals such as "15." as ADJ/amod.
        (token.upos === "ADJ" &&
          /^amod(:|$)/u.test(token.deprel) &&
          /^\p{Nd}+\.$/u.test(token.form) &&
          parseNumeral(token.form.slice(0, -1), language)?.value === value),
    );
  const readings: NumeralReading[] = [];
  const add = (kind: NumeralReading["kind"], rule: string | undefined) => {
    if (!rule || !rules.has(rule)) return;
    const text = formatter.format(value, rule).trim();
    if (text && !/\p{Nd}/u.test(text)) readings.push({ kind, text });
  };
  add("number", "%spellout-numbering");
  const positiveInteger = input.value > 0 && Number.isInteger(input.value);
  if (
    positiveInteger &&
    input.value <= 9999 &&
    (input.value >= 1000 || temporal) &&
    !affixedOrdinal
  )
    add("year", "%spellout-numbering-year");
  if (positiveInteger) {
    const gender =
      tokens.length === 1 ? genders[tokens[0]!.feats.Gender ?? ""] : undefined;
    const candidates = [
      ...(gender ? [`%spellout-ordinal-${gender}`] : []),
      ...ordinalRules,
    ];
    add(
      "ordinal",
      candidates.find((rule) => rules.has(rule)),
    );
  }
  if (!readings.length) return;
  const has = (kind: NumeralReading["kind"]) =>
    readings.some((reading) => reading.kind === kind);
  const preferred =
    ordinal && has("ordinal")
      ? "ordinal"
      : temporal && has("year")
        ? "year"
        : has("number")
          ? "number"
          : readings[0]!.kind;
  return { language: locale, preferred, readings };
}
