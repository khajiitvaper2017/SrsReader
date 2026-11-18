import type { Meaning } from "@/dictionaries/model";

function pronunciation(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(pronunciation);
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  const data = node.data as Record<string, unknown> | undefined;
  const marker = [
    node.type,
    node.class,
    node.className,
    data?.content,
    data?.type,
  ];
  if (
    marker.some(
      (value) =>
        typeof value === "string" &&
        /(?:^|[\s_-])ipa(?:$|[\s_-])/iu.test(value),
    )
  ) {
    function text(value: unknown): string {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.map(text).join("");
      if (!value || typeof value !== "object") return "";
      const node = value as Record<string, unknown>;
      return text(node.content ?? node.text);
    }
    const ipa = text(node.content ?? node.text).trim();
    return ipa ? [ipa] : [];
  }
  return pronunciation(node.content);
}

export function isPhoneticReading(reading: string) {
  return (
    /^(?:\/[^/]+\/|\[[^\]]+\])$/u.test(reading) ||
    /[\u0250-\u02afˈˌː]/u.test(reading)
  );
}

export function dictionaryPronunciations(
  meanings: Meaning[],
  reading = "",
): string[] {
  if (isPhoneticReading(reading)) return [reading];
  return meanings
    .flatMap((meaning) =>
      meaning.tags === "ipa" && meaning.customDefinitions
        ? meaning.customDefinitions
        : (meaning.customDefinitions ?? meaning.definitions).flatMap(
            pronunciation,
          ),
    )
    .slice(0, 1);
}

export function preferredIpaMeanings(
  sources: { merged: boolean; meanings: Meaning[] }[],
): Meaning[] {
  const specific = sources.filter(
    (source) => source.merged && source.meanings.length,
  );
  return (specific.length ? specific : sources).flatMap(
    (source) => source.meanings,
  );
}
