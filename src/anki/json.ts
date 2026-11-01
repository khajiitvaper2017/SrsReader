const identifier = (key: string) => key === "id" || key === "originalId";

// Anki's random field/template IDs exceed JavaScript's exact integer range.
export function parseJson(value: string): unknown {
  return JSON.parse(
    value,
    (key: string, value: unknown, context?: { source: string }) =>
      identifier(key) &&
      typeof value === "number" &&
      !Number.isSafeInteger(value) &&
      context?.source &&
      /^-?\d+$/.test(context.source)
        ? context.source
        : value,
  );
}

export function stringifyJson(value: unknown) {
  const json = JSON as JSON & { rawJSON(value: string): unknown };
  return JSON.stringify(value, (key: string, value: unknown) =>
    identifier(key) && typeof value === "string" && /^-?\d+$/.test(value)
      ? json.rawJSON(value)
      : value,
  );
}
