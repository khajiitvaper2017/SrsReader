import { useEffect, useState, type ReactNode } from "react";
import { browser } from "wxt/browser";
import { rpc } from "./api";
import { db } from "./db";
import { playBlob, speak } from "./audio";
import {
  defaults,
  type Definition,
  type LookupWord,
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
export function Icon({
  name,
}: {
  name: "sound" | "plus" | "arrow" | "check" | "close" | "book";
}) {
  const paths = {
    sound: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    book: (
      <>
        <path d="M12 6v15M3 3c4 0 7 0 9 3 2-3 5-3 9-3v15c-4 0-7 0-9 3-2-3-5-3-9-3Z" />
      </>
    ),
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
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
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void rpc({ action: "settings" })
      .then((value) => {
        setSettings(value);
        setReady(true);
      })
      .catch(console.error);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
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
    <span lang={language}>
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
    <span className="muted">{alt || "[Image unavailable]"}</span>
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
export function Meanings({ meanings }: { meanings: Meaning[] }) {
  const [styles, setStyles] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void db.dictionaries
      .bulkGet(meanings.map((m) => m.dictionaryId))
      .then((rows) => {
        if (alive)
          setStyles(
            Object.fromEntries(
              rows.filter((d) => d !== undefined).map((d) => [d.id, d.styles]),
            ),
          );
      });
    return () => {
      alive = false;
    };
  }, [meanings]);
  return (
    <div className="meanings">
      {meanings.map((meaning, i) => (
        <section className="meaning" key={`${meaning.dictionaryId}:${i}`}>
          <div className="meaning-label">
            <span className="dictionary-name">{meaning.title}</span>
            {meaning.tags
              .split(" ")
              .filter(Boolean)
              .map((tag, j) => (
                <span className="tag" key={j}>
                  {tag}
                </span>
              ))}
          </div>
          <style>
            {scopedStyles(
              styles[meaning.dictionaryId] || "",
              `[data-meaning="${i}"]`,
            )}
          </style>
          <div className="dictionary-content" data-meaning={i}>
            {meaning.definitions.map((definition: Definition, j) => (
              <div key={j}>
                <Structured
                  value={definition}
                  dictionaryId={meaning.dictionaryId}
                />
              </div>
            ))}
          </div>
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
    </div>
  );
}
export function shortDefinition(word: Vocabulary) {
  function text(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(text).join(" ");
    if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      if (["details", "summary", "a"].includes(String(node.tag))) return "";
      if (
        node.data &&
        typeof node.data === "object" &&
        !["glosses"].includes(
          String((node.data as Record<string, unknown>).content),
        )
      )
        return "";
      return text(node.content || node.text);
    }
    return "";
  }
  return word.meanings
    .map((m) => m.definitions.map(text).join("; "))
    .join("; ")
    .replace(/\s+/g, " ")
    .trim();
}
export function AudioButton({
  word,
  sentence,
  settings,
  onError,
}: {
  word: Pick<LookupWord, "id" | "lemma" | "language">;
  sentence?: string;
  settings: Settings;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [attribution, setAttribution] = useState<{
    creator: string;
    license: string;
    page: string;
  }>();
  async function play() {
    setBusy(true);
    onError("");
    try {
      if (sentence) {
        await speak(sentence, word.language, settings.voice);
        return;
      }
      let record = await db.audio.get(word.id);
      if (!record && settings.audioDownloads) {
        try {
          await rpc({ action: "audio", id: word.id, download: true });
          record = await db.audio.get(word.id);
        } catch {
          /* A local voice can still play when the recording service is offline. */
        }
      }
      if (record) {
        try {
          await playBlob(record.blob);
          setAttribution(record);
          return;
        } catch {
          /* Try the installed voice if this browser cannot decode the recording. */
        }
      }
      await speak(word.lemma, word.language, settings.voice);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="audio-control">
      <button
        className={sentence ? "quiet" : "icon-button"}
        title={sentence ? "Read sentence aloud" : "Play word pronunciation"}
        aria-label={
          sentence ? "Read sentence aloud" : "Play word pronunciation"
        }
        disabled={busy}
        onClick={() => void play()}
      >
        <Icon name="sound" />
        {sentence && "Sentence"}
      </button>
      {attribution && (
        <a
          className="audio-credit"
          href={attribution.page}
          target="_blank"
          rel="noopener noreferrer"
        >
          {attribution.creator} · {attribution.license}
        </a>
      )}
    </span>
  );
}
export function intervalLabel(time: number) {
  const minutes = Math.max(1, Math.round((time - Date.now()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 365 ? `${days}d` : `${(days / 365).toFixed(1)}y`;
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
      {["Again", "Hard", "Good", "Easy"].map((label, i) =>
        onlyAgainGood && i !== 0 && i !== 2 ? null : (
          <button
            key={label}
            className={`rating rating-${i + 1}`}
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
