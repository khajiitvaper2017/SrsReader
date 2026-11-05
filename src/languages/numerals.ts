import { icuLanguage } from "@/languages/codes";
import { normalize } from "@/languages/text";

export type NumeralInput = { value: number; canonical: string };
export type NumeralReading = {
  kind: "number" | "year" | "ordinal";
  text: string;
};
export type NumeralLookup = {
  language: string;
  preferred: NumeralReading["kind"];
  readings: NumeralReading[];
};

type NumberSyntax = {
  formatter: Intl.NumberFormat;
  digits: Map<string, string>;
  decimal: string;
  group: string;
  minus: string;
};
const syntaxes = new Map<string, NumberSyntax | undefined>();
const groupingSpace = /^[ \u00a0\u202f]$/u;

function syntax(language: string) {
  if (syntaxes.has(language)) return syntaxes.get(language);
  if (!Intl.NumberFormat.supportedLocalesOf(language).length) {
    syntaxes.set(language, undefined);
    return;
  }
  const formatter = new Intl.NumberFormat(language);
  const parts = formatter.formatToParts(-1234567.8);
  const digits = new Map<string, string>();
  // Bare language defaults can use Latin digits even in an Arabic-script locale.
  const maximized = new Intl.Locale(language).maximize();
  const native = new Intl.NumberFormat(
    `${maximized.language}-${maximized.region}`,
  );
  for (let digit = 0; digit < 10; digit++) {
    digits.set(String(digit), String(digit));
    digits.set(
      formatter.formatToParts(digit).find((part) => part.type === "integer")!
        .value,
      String(digit),
    );
    digits.set(
      native.formatToParts(digit).find((part) => part.type === "integer")!
        .value,
      String(digit),
    );
  }
  const result = {
    formatter,
    digits,
    decimal: parts.find((part) => part.type === "decimal")!.value,
    group: parts.find((part) => part.type === "group")?.value ?? "",
    minus: parts.find((part) => part.type === "minusSign")!.value,
  };
  syntaxes.set(language, result);
  return result;
}

function decimalString(value: number) {
  const [mantissa, exponent] = String(value).split("e");
  if (!exponent) return mantissa!;
  const negative = mantissa!.startsWith("-");
  const unsigned = negative ? mantissa!.slice(1) : mantissa!;
  const [integer, fraction = ""] = unsigned.split(".");
  const digits = integer + fraction;
  const point = integer!.length + Number(exponent);
  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (negative ? "-" : "") + expanded;
}

export function parseNumeral(
  surface: string,
  language: string,
): NumeralInput | undefined {
  let text = normalize(surface).trim();
  if (!text || text.length > 1000) return;
  const locale = syntax(language);
  let negative = false;
  const first = [...text][0]!;
  if (["+", "-", "−", locale?.minus].includes(first)) {
    negative = first !== "+";
    text = text.slice(first.length);
  }
  let ascii = "";
  for (const character of text) {
    const digit =
      locale?.digits.get(character) ??
      (/^[0-9]$/.test(character) ? character : undefined);
    if (digit !== undefined) ascii += digit;
    else if (locale && character === locale.decimal) ascii += ".";
    else if (
      locale?.group &&
      (character === locale.group ||
        (groupingSpace.test(locale.group) && groupingSpace.test(character)))
    )
      ascii += ",";
    else return;
  }
  if (!/^[0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?$/.test(ascii)) return;
  const [integer = "", fraction = ""] = ascii.split(".");
  const chunks = integer.split(",");
  const integerDigits = chunks.join("");
  if (chunks.length > 1) {
    // A same-length exact integer preserves leading zeros when validating grouping.
    const expected = locale!.formatter
      .formatToParts(BigInt("1" + "0".repeat(integerDigits.length - 1)))
      .filter((part) => part.type === "integer")
      .map((part) => [...part.value].length);
    if (
      chunks.length !== expected.length ||
      chunks.some((chunk, index) => chunk.length !== expected[index])
    )
      return;
  }
  const whole = integerDigits.replace(/^0+(?=\d)/, "");
  const decimal = fraction.replace(/0+$/, "");
  const magnitude = whole + (decimal ? `.${decimal}` : "");
  const canonical = (negative && magnitude !== "0" ? "-" : "") + magnitude;
  const value = Number(canonical);
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > Number.MAX_SAFE_INTEGER ||
    decimalString(value) !== canonical
  )
    return;
  return { value, canonical };
}

export function numeralAt(
  text: string,
  offset: number,
  language: string,
): { start: number; end: number } | undefined {
  if (!icuLanguage(language) || offset < 0 || offset >= text.length) return;
  const locale = syntax(language);
  const within = (character: string) =>
    /[\p{Nd}+−.,/:%\p{Sc}-]/u.test(character) ||
    character === locale?.decimal ||
    character === locale?.group ||
    character === locale?.minus ||
    (!!locale &&
      groupingSpace.test(locale.group) &&
      groupingSpace.test(character)) ||
    character === "\u00ad";
  if (!within(text[offset]!)) return;
  let start = offset;
  let end = offset + 1;
  while (start > 0 && offset - start <= 1000 && within(text[start - 1]!))
    start--;
  while (end < text.length && end - start <= 1000 && within(text[end]!)) end++;
  while (start < end && groupingSpace.test(text[start]!)) start++;
  while (end > start && groupingSpace.test(text[end - 1]!)) end--;
  // Sentence punctuation is not part of a newly expanded pointer target.
  if (/[.,]/.test(text[end - 1] ?? "")) end--;
  if (end - start > 1000 || offset < start || offset >= end) return;
  if (
    /[\p{L}\p{M}\p{Nd}_]/u.test(text[start - 1] ?? "") ||
    /[\p{L}\p{M}\p{Nd}_]/u.test(text[end] ?? "")
  )
    return;
  return parseNumeral(text.slice(start, end), language)
    ? { start, end }
    : undefined;
}
