export function phraseMatchesPartOfSpeech(
  parsed: readonly string[] | undefined,
  expected: readonly string[],
  inflected: boolean,
) {
  return (
    !inflected ||
    !parsed ||
    !expected.length ||
    parsed.some((pos) => !pos || pos === "_" || expected.includes(pos))
  );
}
