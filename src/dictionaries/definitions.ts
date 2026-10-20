import type { Vocabulary } from "@/vocabulary/model";

export function definitionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(definitionText).join(" ");
  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    if (["details", "summary", "a"].includes(String(node.tag))) return "";
    if (
      node.data &&
      typeof node.data === "object" &&
      !["glosses", "glossary"].includes(
        String((node.data as Record<string, unknown>).content),
      )
    )
      return "";
    const text = definitionText(node.content || node.text);
    return node.tag === "li" ? `${text}; ` : text;
  }
  return "";
}

export function shortDefinition(word: Vocabulary) {
  return word.meanings
    .map((m) => m.definitions.map(definitionText).join("; "))
    .join("; ")
    .replace(/\s+/g, " ")
    .trim();
}
