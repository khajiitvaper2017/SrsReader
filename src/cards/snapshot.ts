import Dexie from "dexie";
import { t } from "@/shared/i18n/i18n";
import type { CardAsset } from "@/cards/model";
import { assetId } from "@/cards/model";
import type { LookupWord, Meaning } from "@/dictionaries/model";
import { safeUrl } from "@/dictionaries/sanitize";
import { dictionaryImage } from "@/dictionaries/storage";
import { db } from "@/platform/database/db";
import { dictionaryPartsOfSpeech } from "@/dictionaries/grammar";

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

const tags = new Set(
  "a div span p ol ul li details summary table thead tbody tfoot tr td th br ruby rt rp strong em b i small sup sub".split(
    " ",
  ),
);
const styles = new Set(
  "fontStyle fontWeight fontSize textDecorationLine textDecorationStyle verticalAlign textAlign whiteSpace wordBreak listStyleType borderStyle borderWidth borderRadius padding margin display width height maxWidth".split(
    " ",
  ),
);

export const dictionaryImageName = (dictionaryId: string, path: string) =>
  `_srs_${encodeURIComponent(dictionaryId)}_${encodeURIComponent(path)}`;

function snapshotImageName(
  dictionaryId: string,
  path: string,
  images?: Map<string, { dictionaryId: string; path: string }>,
) {
  if (!path.startsWith("data:")) return dictionaryImageName(dictionaryId, path);
  if (!images) return path;
  const existing = [...images].find(([, image]) => image.path === path);
  return existing?.[0] ?? `_srs_embedded_${images.size}`;
}

function structuredHtml(
  value: unknown,
  dictionaryId: string,
  images?: Map<string, { dictionaryId: string; path: string }>,
): string {
  if (typeof value === "string" || typeof value === "number")
    return escapeHtml(String(value));
  if (Array.isArray(value))
    return value
      .map((child) => structuredHtml(child, dictionaryId, images))
      .join("");
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  if (node.type === "text")
    return typeof node.text === "string" ? escapeHtml(node.text) : "";
  if (node.type === "image" || node.tag === "img") {
    if (typeof node.path !== "string") return "";
    const name = snapshotImageName(dictionaryId, node.path, images);
    images?.set(name, { dictionaryId, path: node.path });
    const alt =
      typeof node.description === "string"
        ? node.description
        : typeof node.title === "string"
          ? node.title
          : "";
    return `<img src="${escapeHtml(name)}" alt="${escapeHtml(alt)}"${typeof node.width === "number" ? ` width="${node.width}"` : ""}${typeof node.height === "number" ? ` height="${node.height}"` : ""}>`;
  }
  const content = structuredHtml(node.content, dictionaryId, images);
  const href = node.tag === "a" ? safeUrl(node.href) : undefined;
  if (node.tag === "a" && !href) return content;
  if (typeof node.tag !== "string" || !tags.has(node.tag)) return content;
  const attrs: string[] = [];
  if (href)
    attrs.push(
      `href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"`,
    );
  for (const key of ["lang", "title"])
    if (typeof node[key] === "string")
      attrs.push(`${key}="${escapeHtml(node[key])}"`);
  if (node.tag === "details" && node.open === true) attrs.push("open");
  if (node.tag === "td" || node.tag === "th")
    for (const key of ["colSpan", "rowSpan"])
      if (typeof node[key] === "number")
        attrs.push(`${key.toLowerCase()}="${node[key]}"`);
  if (node.data && typeof node.data === "object")
    for (const [key, value] of Object.entries(node.data))
      if (/^[a-z][a-zA-Z0-9]*$/.test(key) && typeof value === "string")
        attrs.push(
          `data-sc-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${escapeHtml(value)}"`,
        );
  if (node.style && typeof node.style === "object") {
    const css = Object.entries(node.style)
      .filter(
        ([key, value]) =>
          styles.has(key) &&
          (typeof value === "number" ||
            (typeof value === "string" &&
              !/[();{}]|url|expression/i.test(value))),
      )
      .map(
        ([key, value]) =>
          `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${typeof value === "number" && !["fontWeight"].includes(key) ? `${value}px` : value}`,
      )
      .join(";");
    if (css) attrs.push(`style="${escapeHtml(css)}"`);
  }
  return `<${node.tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${node.tag === "br" ? "" : `${content}</${node.tag}>`}`;
}

function serializeMeanings(
  meanings: Meaning[],
  images?: Map<string, { dictionaryId: string; path: string }>,
) {
  return meanings
    .map((meaning) => {
      const definitions = meaning.customDefinitions ?? meaning.definitions;
      const attribution = meaning.attribution
        ? `<footer class="srs-attribution"${safeUrl(meaning.attribution) || safeUrl(meaning.sourceUrl) ? ' data-sc-content="backlink"' : ""}>${escapeHtml(meaning.attribution)}</footer>`
        : "";
      return `<section class="srs-meaning" data-dictionary="${escapeHtml(meaning.dictionaryId)}"><div class="srs-dictionary-title">${escapeHtml(meaning.title)}</div>${meaning.tags ? `<div class="srs-tags">${escapeHtml(meaning.tags)}</div>` : ""}<div class="srs-glossary">${definitions.map((definition) => `<div>${structuredHtml(definition, meaning.dictionaryId, images)}</div>`).join("")}</div>${attribution}</section>`;
    })
    .join("");
}

// This serializer also runs during database upgrades in the background worker.
export function definitionsHtml(meanings: Meaning[]): string {
  return serializeMeanings(meanings);
}

function scopeCss(css: string, scope: string): string {
  let result = "";
  let start = 0;
  let quote = "";
  let comment = false;
  for (let i = 0; i < css.length; i++) {
    const char = css[i]!;
    if (comment) {
      if (char === "*" && css[i + 1] === "/") {
        comment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      comment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ";") {
      result += css.slice(start, i + 1);
      start = i + 1;
      continue;
    }
    if (char !== "{") continue;
    const prelude = css.slice(start, i).trim();
    let depth = 1;
    let end = i + 1;
    let innerQuote = "";
    let innerComment = false;
    for (; end < css.length && depth; end++) {
      const current = css[end]!;
      if (innerComment) {
        if (current === "*" && css[end + 1] === "/") {
          innerComment = false;
          end++;
        }
      } else if (innerQuote) {
        if (current === "\\") end++;
        else if (current === innerQuote) innerQuote = "";
      } else if (current === "/" && css[end + 1] === "*") {
        innerComment = true;
        end++;
      } else if (current === '"' || current === "'") innerQuote = current;
      else if (current === "{") depth++;
      else if (current === "}") depth--;
    }
    const content = css.slice(i + 1, end - 1);
    if (/^@(?:media|supports|container|layer)\b/i.test(prelude))
      result += `${prelude}{${scopeCss(content, scope)}}`;
    else if (prelude.startsWith("@")) result += `${prelude}{${content}}`;
    else
      result += `${prelude
        .split(/,(?![^()[\]]*[)\]])/)
        .map((selector) =>
          /^(?:html|body|:root)(?=[\s.#[:]|$)/.test(selector.trim())
            ? selector.trim().replace(/^(?:html|body|:root)/, scope)
            : `${scope} ${selector.trim()}`,
        )
        .join(",")}{${content}}`;
    i = end - 1;
    start = end;
  }
  return result + css.slice(start);
}

export async function prepareDictionarySnapshot(
  word: Pick<LookupWord, "id" | "meanings"> & { hiddenDictionaries?: string[] },
  {
    namespace = word.id,
    allowMissingMedia = false,
  }: { namespace?: string; allowMissingMedia?: boolean } = {},
) {
  const images = new Map<string, { dictionaryId: string; path: string }>();
  const meanings = word.meanings.filter(
    (meaning) => !word.hiddenDictionaries?.includes(meaning.dictionaryId),
  );
  const parts = dictionaryPartsOfSpeech(meanings);
  let html = `${parts.length ? `<div class="srs-tags" data-srs-pos>${parts.map(escapeHtml).join(" · ")}</div>` : ""}${serializeMeanings(meanings, images)}`;
  let css =
    ".srs-meaning{margin-block:var(--mantine-spacing-sm)}.srs-dictionary-title,.srs-tags,.srs-attribution{font-size:.85em;color:var(--mantine-color-dimmed)}.srs-glossary>div+div{margin-top:var(--mantine-spacing-xs)}";
  for (const dictionaryId of new Set(
    meanings.map((meaning) => meaning.dictionaryId),
  )) {
    const dictionary = await db.dictionaries.get(dictionaryId);
    if (!dictionary?.styles) continue;
    const scoped = scopeCss(
      dictionary.styles,
      `[data-dictionary="${dictionaryId.replace(/["\\\n\r]/g, (char) => `\\${char.codePointAt(0)!.toString(16)} `)}"]`,
    );
    css += scoped.replace(
      /url\(\s*(["']?)(.*?)\1\s*\)/gi,
      (whole, quote: string, path: string) => {
        if (/^(?:https?:|#)/i.test(path)) return whole;
        if (path.startsWith("data:")) {
          const name = snapshotImageName(dictionaryId, path, images);
          images.set(name, { dictionaryId, path });
          return `url("${name}")`;
        }
        let filePath = path.split(/[?#]/)[0]!.replace(/^\.?\//, "");
        try {
          filePath = decodeURIComponent(filePath);
        } catch {
          /* Keep a literal percent in dictionary filenames. */
        }
        const name = dictionaryImageName(dictionaryId, filePath);
        images.set(name, { dictionaryId, path: filePath });
        const fragment = path.includes("#")
          ? `#${path.split("#").slice(1).join("#")}`
          : "";
        return `url(${quote || '"'}${name}${fragment}${quote || '"'})`;
      },
    );
  }
  const assets: CardAsset[] = [];
  for (const [name, image] of images) {
    let blob: Blob | undefined;
    let filename = name;
    if (image.path.startsWith("data:")) {
      const [dataUrl, ...fragments] = image.path.split("#");
      const fragment = fragments.length ? `#${fragments.join("#")}` : "";
      const comma = dataUrl!.indexOf(",");
      const metadata = dataUrl!.slice(5, comma);
      const content = dataUrl!.slice(comma + 1);
      const mime = metadata.split(";")[0] || "application/octet-stream";
      const bytes = metadata.split(";").includes("base64")
        ? Uint8Array.from(atob(content), (char) => char.charCodeAt(0))
        : new TextEncoder().encode(decodeURIComponent(content));
      blob = new Blob([bytes], { type: mime });
      // Word mutations and database upgrades can own the surrounding transaction.
      const hash = await Dexie.waitFor(
        crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataUrl!)),
      );
      const digest = Array.from(new Uint8Array(hash), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");
      const subtype =
        mime.split("/")[1]?.replace("+xml", "").replace("jpeg", "jpg") ?? "bin";
      const extension = /^[a-z0-9]{1,8}$/i.test(subtype) ? subtype : "bin";
      filename = `_srs_embedded_${digest}.${extension}`;
      html = html.replaceAll(
        `src="${name}"`,
        `src="${filename}${escapeHtml(fragment)}"`,
      );
      css = css.replaceAll(
        `url("${name}")`,
        `url("${filename}${fragment.replaceAll('"', "%22")}")`,
      );
    } else {
      const media = await dictionaryImage(image.dictionaryId, image.path);
      blob = media?.blob;
      if (media) {
        const key = JSON.stringify([
          image.dictionaryId,
          media.revisionId,
          image.path,
        ]);
        const hash = await Dexie.waitFor(
          crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
        );
        const digest = Array.from(new Uint8Array(hash), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
        const extension = image.path.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? ".bin";
        filename = `_srs_asset_${digest}${extension}`;
        html = html.replaceAll(`src="${name}"`, `src="${filename}"`);
        css = css.replace(
          /url\(\s*(["']?)(.*?)\1\s*\)/gi,
          (whole, quote: string, value: string) =>
            value === name || value.startsWith(`${name}#`)
              ? `url(${quote || '"'}${filename}${value.slice(name.length)}${quote || '"'})`
              : whole,
        );
      }
    }
    if (!blob) {
      if (allowMissingMedia) continue;
      throw new Error(t("card_asset_unavailable", { name: image.path }));
    }
    assets.push({
      id: assetId(namespace, filename),
      namespace,
      name: filename,
      mime: blob.type,
      blob,
    });
  }
  html = `<style>${css.replace(/<\/style/gi, "\\3c /style")}</style>${html}`;
  return { html, assets, css };
}
