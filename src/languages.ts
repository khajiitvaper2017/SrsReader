export const supportedLanguages = [
  {
    code: "cs",
    name: "Czech",
    iso3: "ces",
    dictionaryUrl:
      "https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/cs/cs/wty-cs-cs.zip?download=true",
  },
] as const;

export function languageName(code: string) {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
}
