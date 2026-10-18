import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronUp, EyeOff } from "lucide-react";
import { t, i18n, setInterfaceLanguage, number } from "./i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useState, type ReactNode } from "react";
import { browser } from "wxt/browser";
import { rpc } from "./api";
import { db } from "./db";
import { installInputPrevention } from "./input-prevention";
import { TextTranslation } from "./SentenceTranslation";
import {
  defaults,
  meaningTags,
  type Definition,
  type Meaning,
  type ReadingContext,
  type Settings,
  type Vocabulary,
} from "./model";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-icon">
        s<span>r</span>
      </span>
      <span>
        Srs<span className="muted">Reader</span>
      </span>
    </span>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <div className="muted">{children}</div>
    </div>
  );
}
export function useSettings(
  scope: "extensionPages" | "popups" = "extensionPages",
) {
  useTranslation(undefined, { i18n });
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const load = () => {
      void rpc({ action: "settings" })
        .then((value) => {
          setSettings(value);
          setReady(true);
        })
        .catch(console.error);
    };
    const changed = (message: { event?: string }) => {
      if (message.event === "changed") load();
    };
    load();
    browser.runtime.onMessage.addListener(changed);
    return () => browser.runtime.onMessage.removeListener(changed);
  }, []);
  useEffect(() => {
    void setInterfaceLanguage(
      settings.interfaceLanguage,
      settings.nativeLanguage,
    );
  }, [settings.interfaceLanguage, settings.nativeLanguage]);
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage || "en";
    document.documentElement.dir = i18n.dir();
    document.title =
      scope === "popups" ? t("dictionary_page_title") : "SrsReader";
  }, [settings.nativeLanguage, i18n.resolvedLanguage, scope]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(
    () => installInputPrevention(() => settings, scope),
    [settings, scope],
  );
  return [settings, setSettings, ready] as const;
}
export function useChanges(callback: () => void) {
  useEffect(() => {
    const listener = (message: { event?: string }) => {
      if (message.event === "changed") callback();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [callback]);
}
export function Sentence({
  context,
  language,
}: {
  context: ReadingContext;
  language: string;
}) {
  return (
    <span lang={language} dir="auto">
      {context.sentence.slice(0, context.start)}
      <mark>{context.sentence.slice(context.start, context.end)}</mark>
      {context.sentence.slice(context.end)}
    </span>
  );
}
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
function safeUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function ImageContent({
  path,
  dictionaryId,
  alt,
  width,
  height,
}: {
  path: string;
  dictionaryId: string;
  alt?: string;
  width?: number;
  height?: number;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    let disposed = false;
    if (/^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);base64,/.test(path)) {
      setUrl(path);
      return;
    }
    void db.dictionaries.get(dictionaryId).then(async (dictionary) => {
      if (!dictionary) return;
      const media = await db.dictionaryMedia.get(
        `${dictionary.revisionId}:${path}`,
      );
      if (media && !disposed) {
        objectUrl = URL.createObjectURL(media.blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, dictionaryId]);
  return url ? (
    <img
      src={url}
      alt={alt || ""}
      width={width}
      height={height}
      loading="lazy"
    />
  ) : (
    <span className="muted">{alt || t("image_unavailable")}</span>
  );
}
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

function Structured({
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
function scopedStyles(css: string, scope: string) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css.replace(/@import[^;]*;/gi, ""));
    function rules(list: CSSRuleList): string {
      return [...list]
        .map((rule) => {
          if (rule instanceof CSSStyleRule) {
            const declarations = [...rule.style]
              .filter(
                (name) =>
                  !/position|z-index|content|animation|transition|behavior/i.test(
                    name,
                  ) &&
                  !/url\s*\(|expression|@import/i.test(
                    rule.style.getPropertyValue(name),
                  ),
              )
              .map((name) => `${name}:${rule.style.getPropertyValue(name)}`)
              .join(";");
            return `${rule.selectorText
              .split(",")
              .map((selector) => `${scope} ${selector.trim()}`)
              .join(",")}{${declarations}}`;
          }
          if (rule instanceof CSSMediaRule)
            return `@media ${rule.conditionText}{${rules(rule.cssRules)}}`;
          return "";
        })
        .join("\n");
    }
    return rules(sheet.cssRules);
  } catch {
    return "";
  }
}
export function Meanings({
  meanings,
  language,
  settings,
  onIgnoreTag,
}: {
  meanings: Meaning[];
  language: string;
  settings: Settings;
  onIgnoreTag?: (tag: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstDictionary = meanings.find(
    (meaning) => meaning.definitions.length,
  )?.dictionaryId;
  const hasMore = meanings.some(
    (meaning) =>
      meaning.definitions.length && meaning.dictionaryId !== firstDictionary,
  );
  const visible =
    settings.firstDictionaryOnly && !expanded
      ? meanings.filter((meaning) => meaning.dictionaryId === firstDictionary)
      : meanings;
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [tagDescriptions, setTagDescriptions] = useState<
    Record<string, string>
  >({});
  const [monolingual, setMonolingual] = useState<string[]>([]);
  const [definitionLanguages, setDefinitionLanguages] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    setExpanded(false);
    let alive = true;
    void db.dictionaries
      .bulkGet(meanings.map((m) => m.dictionaryId))
      .then(async (rows) => {
        const tags = await db.tags
          .where("revisionId")
          .anyOf(
            rows
              .filter((row) => row !== undefined)
              .map((row) => row.revisionId),
          )
          .toArray();
        if (alive) {
          setDefinitionLanguages(
            Object.fromEntries(
              rows
                .filter((row) => row !== undefined)
                .map((row) => [row.id, row.target]),
            ),
          );
          setTagDescriptions(
            Object.fromEntries(
              rows
                .filter((row) => row !== undefined)
                .flatMap((row) =>
                  tags
                    .filter(
                      (tag) =>
                        tag.revisionId === row.revisionId &&
                        tag.description &&
                        tag.description !== tag.name,
                    )
                    .map((tag) => [
                      `${row.id}:${tag.name}`,
                      tag.description || tag.name,
                    ]),
                ),
            ),
          );
          setStyles(
            Object.fromEntries(
              rows.filter((d) => d !== undefined).map((d) => [d.id, d.styles]),
            ),
          );
          setMonolingual(
            rows
              .filter((d) => d?.language === language && d.target === language)
              .map((d) => d!.id),
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [meanings, language, settings.interfaceLanguage, settings.nativeLanguage]);
  return (
    <div className="meanings">
      {visible.map((meaning, i) => (
        <section className="meaning" key={`${meaning.dictionaryId}:${i}`}>
          <div className="meaning-label">
            <span className="dictionary-name">
              {meaning.dictionaryId === "personal"
                ? t("personal_definition")
                : meaning.title}
            </span>
            {meaningTags(meaning).map((tag, j) =>
              onIgnoreTag ? (
                <DropdownMenu.Root key={j} modal={false}>
                  <DropdownMenu.Trigger
                    className="tag tag-action"
                    data-srs-reader=""
                    title={
                      meaning.tagDescriptions?.[tag] ||
                      tagDescriptions[`${meaning.dictionaryId}:${tag}`] ||
                      undefined
                    }
                  >
                    {tag}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="tag-menu"
                      sideOffset={4}
                      collisionPadding={8}
                      aria-label={tag}
                      data-srs-reader=""
                    >
                      <DropdownMenu.Item
                        className="select-option"
                        onSelect={() => onIgnoreTag(tag)}
                      >
                        <EyeOff aria-hidden="true" />{" "}
                        {t("ignore_words_with_tag")}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : (
                <span
                  className="tag"
                  key={j}
                  title={
                    meaning.tagDescriptions?.[tag] ||
                    tagDescriptions[`${meaning.dictionaryId}:${tag}`] ||
                    undefined
                  }
                >
                  {tag}
                </span>
              ),
            )}
          </div>
          <style>
            {scopedStyles(
              styles[meaning.dictionaryId] || "",
              `[data-meaning="${i}"]`,
            )}
          </style>
          <div
            className="dictionary-content"
            data-meaning={i}
            data-reading-language={
              meaning.dictionaryId === "nechybujte"
                ? "cs"
                : meaning.dictionaryId === "personal"
                  ? settings.nativeLanguage
                  : definitionLanguages[meaning.dictionaryId] || ""
            }
          >
            {meaning.dictionaryId === "nechybujte" ? (
              <ol data-sc-content="glosses">
                {meaning.definitions.map((definition, j) => (
                  <li key={j}>
                    <Structured
                      value={definition}
                      dictionaryId={meaning.dictionaryId}
                    />
                  </li>
                ))}
              </ol>
            ) : (
              meaning.definitions.map((definition: Definition, j) => (
                <div key={j}>
                  <Structured
                    value={definition}
                    dictionaryId={meaning.dictionaryId}
                  />
                </div>
              ))
            )}
          </div>
          {(monolingual.includes(meaning.dictionaryId) ||
            meaning.dictionaryId === "nechybujte") &&
            language !== settings.nativeLanguage && (
              <TextTranslation
                compact
                key={`${meaning.dictionaryId}:${i}:${settings.nativeLanguage}`}
                text={meaning.definitions
                  .map((definition, index) => {
                    const text = definitionText(definition)
                      .replace(/[ \t]+/g, " ")
                      .trim();
                    return text ? `${index + 1}. ${text}` : "";
                  })
                  .filter(Boolean)
                  .join("\n")}
                language={language}
                settings={settings}
                label={t("translate_definition")}
              />
            )}
          {meaning.attribution && (
            <div className="attribution">
              {safeUrl(meaning.attribution) || safeUrl(meaning.sourceUrl) ? (
                <a
                  href={
                    safeUrl(meaning.attribution) || safeUrl(meaning.sourceUrl)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {meaning.attribution}
                </a>
              ) : (
                meaning.attribution
              )}
            </div>
          )}
        </section>
      ))}
      {settings.firstDictionaryOnly && hasMore && (
        <button
          className="quiet icon-button dictionary-expand"
          title={expanded ? t("fewer_dictionaries") : t("more_dictionaries")}
          aria-label={
            expanded ? t("fewer_dictionaries") : t("more_dictionaries")
          }
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
function definitionText(value: unknown): string {
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
export { AudioButton } from "./AudioButton";
export function intervalLabel(time: number) {
  const minutes = Math.max(1, Math.round((time - Date.now()) / 60000));
  if (minutes < 60) return t("interval_minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("interval_hours", { count: hours });
  const days = Math.round(hours / 24);
  return days < 365
    ? t("interval_days", { count: days })
    : t("interval_years", {
        value: number(days / 365, { maximumFractionDigits: 1 }),
      });
}
export function Ratings({
  times,
  disabled,
  onGrade,
  onlyAgainGood,
}: {
  times: number[];
  disabled: boolean;
  onGrade: (rating: number) => void;
  onlyAgainGood: boolean;
}) {
  return (
    <div className="ratings">
      {[t("again"), t("hard"), t("good"), t("easy")].map((label, i) =>
        onlyAgainGood && i !== 0 && i !== 2 ? null : (
          <button
            key={label}
            className={`rating rating-${i + 1}`}
            title={times[i] ? intervalLabel(times[i]!) : undefined}
            disabled={disabled}
            onClick={() => onGrade(i + 1)}
          >
            <span>{label}</span>
            <small>{times[i] ? intervalLabel(times[i]!) : "—"}</small>
          </button>
        ),
      )}
    </div>
  );
}
