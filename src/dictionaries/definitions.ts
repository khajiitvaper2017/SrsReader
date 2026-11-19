import type { Vocabulary } from "@/vocabulary/model";
import type { Definition } from "@/dictionaries/model";

export function mapDefinitionSenses(
  definitions: Definition[],
  transform: (text: string) => unknown,
): Definition[] {
  function sense(value: unknown): unknown {
    const text = definitionText(value, "\n").trim();
    if (!text) return value;
    const translated = transform(text);
    let inserted = false;
    function replace(value: unknown): unknown {
      if (!definitionText(value)) return value;
      if (typeof value === "string") {
        if (inserted) return "";
        inserted = true;
        return translated;
      }
      if (Array.isArray(value)) return value.map(replace);
      const node = value as Record<string, unknown>;
      return node.type === "text"
        ? replace(node.text)
        : { ...node, content: replace(node.content) };
    }
    return replace(value);
  }
  let hasSenses = false;
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const node = value as Record<string, unknown>;
    if (
      (node.data as Record<string, unknown> | undefined)?.content ===
        "glosses" &&
      Array.isArray(node.content)
    ) {
      hasSenses = true;
      return { ...node, content: node.content.map(sense) };
    }
    return { ...node, content: visit(node.content) };
  }
  return definitions.map((definition) => {
    hasSenses = false;
    const mapped = visit(definition);
    return (hasSenses ? mapped : sense(definition)) as Definition;
  });
}

export function definitionSenses(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function definitionText(value: unknown, senseSeparator = "; "): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((child) => definitionText(child, senseSeparator))
      .join(" ");
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
    const text = definitionText(node.content || node.text, senseSeparator);
    return node.tag === "li" ? `${text}${senseSeparator}` : text;
  }
  return "";
}

export function shortDefinition(word: Vocabulary) {
  const glosses = word.meanings.flatMap(({ customDefinitions, definitions }) =>
    (customDefinitions ?? definitions).flatMap((definition) =>
      definitionText(definition, "\n")
        .split(/[;\r\n]/u)
        .map((gloss) => gloss.replace(/\s+/gu, " ").trim())
        .filter(Boolean),
    ),
  );
  return [...new Set(glosses)].slice(0, 3).join("; ");
}
