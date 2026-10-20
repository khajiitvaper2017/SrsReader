import { ImageContent } from "@/dictionaries/components/DictionaryImage";
import { safeUrl } from "@/dictionaries/sanitize";
import { type ReactNode } from "react";

const allowedTags = new Set([
  "div",
  "span",
  "p",
  "ol",
  "ul",
  "li",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "br",
  "ruby",
  "rt",
  "rp",
  "strong",
  "em",
  "b",
  "i",
  "small",
  "sup",
  "sub",
]);

const safeStyles = new Set([
  "fontStyle",
  "fontWeight",
  "fontSize",
  "textDecorationLine",
  "textDecorationStyle",
  "verticalAlign",
  "textAlign",
  "whiteSpace",
  "wordBreak",
  "listStyleType",
  "borderStyle",
  "borderWidth",
  "borderRadius",
  "padding",
  "margin",
  "display",
  "width",
  "height",
  "maxWidth",
]);

function hasSectionContent(value: unknown): boolean {
  function text(value: unknown): string {
    if (typeof value === "string" || typeof value === "number")
      return String(value);
    if (Array.isArray(value)) return value.map(text).join(" ");
    if (!value || typeof value !== "object") return "";
    const node = value as Record<string, unknown>;
    if (
      node.tag === "summary" ||
      (node.data as Record<string, unknown> | undefined)?.content === "backlink"
    )
      return "";
    if (
      (node.type === "image" || node.tag === "img") &&
      typeof node.path === "string"
    )
      return "\uFFFC";
    return text(node.content ?? node.text);
  }
  const content = text(value).replace(/\s+/gu, " ").trim();
  return (
    /[\p{L}\p{N}\uFFFC]/u.test(content) &&
    !/^(?:[\p{L}\p{M}]+\s+){0,2}\?+[.!]?$/u.test(content)
  );
}

export function Structured({
  value,
  dictionaryId,
}: {
  value: unknown;
  dictionaryId: string;
}): ReactNode {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value))
    return value.map((child, i) => (
      <Structured key={i} value={child} dictionaryId={dictionaryId} />
    ));
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (node.tag === "details" && !hasSectionContent(node.content)) return null;
  if (node.type === "structured-content") {
    function preamble(value: unknown): boolean {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
      const item = value as Record<string, unknown>;
      return (
        (item.data as Record<string, unknown> | undefined)?.content ===
          "preamble" ||
        (Array.isArray(item.content) && item.content.some(preamble))
      );
    }
    const content = Array.isArray(node.content)
      ? [...node.content].sort(
          (a, b) => Number(preamble(a)) - Number(preamble(b)),
        )
      : node.content;
    return <Structured value={content} dictionaryId={dictionaryId} />;
  }
  if (node.type === "text")
    return typeof node.text === "string" ? node.text : null;
  if (node.type === "image" || node.tag === "img")
    return typeof node.path === "string" ? (
      <ImageContent
        path={node.path}
        dictionaryId={dictionaryId}
        alt={
          typeof node.description === "string"
            ? node.description
            : typeof node.title === "string"
              ? node.title
              : ""
        }
        width={typeof node.width === "number" ? node.width : undefined}
        height={typeof node.height === "number" ? node.height : undefined}
      />
    ) : null;
  const content = (
    <Structured value={node.content} dictionaryId={dictionaryId} />
  );
  if (node.tag === "a") {
    const href = safeUrl(node.href);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    ) : (
      content
    );
  }
  if (typeof node.tag !== "string" || !allowedTags.has(node.tag))
    return content;
  const Tag = node.tag as "div";
  const props: Record<string, unknown> = {};
  if (typeof node.lang === "string") props.lang = node.lang;
  if (typeof node.title === "string") props.title = node.title;
  if (node.tag === "details") props.open = node.open === true;
  if (node.tag === "td" || node.tag === "th") {
    if (typeof node.colSpan === "number") props.colSpan = node.colSpan;
    if (typeof node.rowSpan === "number") props.rowSpan = node.rowSpan;
  }
  if (node.data && typeof node.data === "object")
    for (const [key, value] of Object.entries(node.data)) {
      if (/^[a-z][a-zA-Z0-9]*$/.test(key) && typeof value === "string")
        props[
          `data-sc-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
        ] = value;
    }
  if (node.style && typeof node.style === "object")
    props.style = Object.fromEntries(
      Object.entries(node.style).filter(
        ([key, value]) =>
          safeStyles.has(key) &&
          (typeof value === "number" ||
            (typeof value === "string" &&
              !/[();{}]|url|expression/i.test(value))),
      ),
    );
  if (node.tag === "br") return <br />;
  return <Tag {...props}>{content}</Tag>;
}
