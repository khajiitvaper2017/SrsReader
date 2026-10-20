export const normalize = (text: string) => text.normalize("NFC");

export const folded = (text: string, language: string) =>
  normalize(text).toLocaleLowerCase(language);
