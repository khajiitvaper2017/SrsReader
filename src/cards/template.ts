import { parseHTML } from "linkedom";
import type { CardDocument, NoteType } from "@/cards/model";
import { escapeHtml } from "@/cards/snapshot";
import { isPhoneticReading } from "@/dictionaries/pronunciation";
import { t } from "@/shared/i18n/i18n";

export function fieldText(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(rt|rp)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|apos|#39|nbsp|#(\d+)|#x([\da-f]+));/gi,
      (entity, decimal, hex) => {
        if (decimal || hex) {
          const code = parseInt(decimal || hex, hex ? 16 : 10);
          return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
        }
        return (
          {
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&apos;": "'",
            "&#39;": "'",
            "&nbsp;": " ",
          }[entity.toLowerCase()] || entity
        );
      },
    )
    .trim();
}

function templateText(value: string): string {
  const stripped = value.replace(
    /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>]*>/gi,
    "",
  );
  return stripped.includes("&")
    ? (
        parseHTML(`<html><body>${stripped}</body></html>`).document.body
          .textContent ?? ""
      ).replaceAll("\u00a0", " ")
    : stripped;
}

export type RenderOptions = {
  deckName?: string;
  front?: "word" | "sentence";
  showReading?: boolean;
  showPartOfSpeech?: boolean;
  showGenderedArticle?: boolean;
};

export function templateWarnings(
  noteType: Pick<NoteType, "templates">,
): string[] {
  const supported = new Set([
    "text",
    "furigana",
    "kana",
    "kanji",
    "cloze",
    "cloze-only",
    "hint",
    "type",
    "edit",
  ]);
  return [
    ...new Set(
      noteType.templates.flatMap((template) =>
        [
          ...`${template.front}\n${template.back}`.matchAll(
            /\{\{([^{}]+)\}\}/g,
          ),
        ].flatMap((match) =>
          /^[#^/]/.test(match[1]!.trim())
            ? []
            : match[1]!
                .split(":")
                .slice(0, -1)
                .filter(
                  (filter) =>
                    !supported.has(filter) && !filter.startsWith("tts "),
                ),
        ),
      ),
    ),
  ];
}

function furigana(value: string, mode: "furigana" | "kana" | "kanji") {
  return value.replace(
    /([^\s<>]+?)\[([^\]]+)\]/g,
    (_, base: string, reading: string) =>
      mode === "kana"
        ? reading
        : mode === "kanji"
          ? base
          : `<ruby>${base}<rt>${reading}</rt></ruby>`,
  );
}

function cloze(
  value: string,
  ordinal: number,
  revealed: boolean,
  only = false,
): string {
  let result = "";
  let cursor = 0;
  const pattern = /\{\{c(\d+)::/gi;
  for (let match; (match = pattern.exec(value));) {
    if (!only) result += value.slice(cursor, match.index);
    const start = pattern.lastIndex;
    let end = start;
    let depth = 1;
    let split = -1;
    while (end < value.length && depth) {
      if (value.startsWith("{{", end)) {
        depth++;
        end += 2;
      } else if (value.startsWith("}}", end)) {
        depth--;
        if (depth) end += 2;
      } else {
        if (depth === 1 && split < 0 && value.startsWith("::", end))
          split = end;
        end++;
      }
    }
    if (depth) {
      if (!only) result += value.slice(match.index);
      return result;
    }
    const answer = value.slice(start, split < 0 ? end : split);
    const hint = split < 0 ? "…" : value.slice(split + 2, end);
    const active = Number(match[1]) === ordinal + 1;
    if (active)
      result += `<span class="cloze">${revealed ? cloze(answer, ordinal, true) : `[${hint}]`}</span>`;
    else result += cloze(answer, ordinal, revealed, only);
    cursor = end + 2;
    pattern.lastIndex = cursor;
  }
  return result + (only ? "" : value.slice(cursor));
}

function renderTemplate(
  template: string,
  fields: Record<string, string>,
  {
    ordinal = 0,
    revealed = false,
  }: { ordinal?: number; revealed?: boolean } = {},
): string {
  const tokens = template.split(/(\{\{[\s\S]*?\}\})/g);
  const field = (name: string) =>
    Object.hasOwn(fields, name) ? fields[name] || "" : "";
  let position = 0;
  function section(end?: string): string {
    let html = "";
    while (position < tokens.length) {
      const token = tokens[position++]!;
      if (!token.startsWith("{{")) {
        html += token;
        continue;
      }
      if (!token.endsWith("}}")) throw new Error(t("card_template_invalid"));
      const tag = token.slice(2, -2).trim();
      if (tag.startsWith("/")) {
        if (tag.slice(1).trim() === end) return html;
        throw new Error(t("card_template_invalid"));
      }
      if (tag.startsWith("#") || tag.startsWith("^")) {
        const name = tag.slice(1).trim();
        const content = section(name);
        const present =
          !!templateText(field(name)).trim() ||
          /<(?:img|audio|video|svg)\b|\[sound:/i.test(field(name));
        if (present !== tag.startsWith("^")) html += content;
        continue;
      }
      const parts = tag.split(":");
      const name = parts.pop()!.trim();
      let value = field(name);
      for (const filter of parts.reverse()) {
        if (filter === "text") value = templateText(value);
        else if (["furigana", "kana", "kanji"].includes(filter))
          value = furigana(value, filter as "furigana" | "kana" | "kanji");
        else if (filter === "cloze" || filter === "cloze-only")
          value = cloze(value, ordinal, revealed, filter === "cloze-only");
        else if (filter === "hint")
          value = value
            ? `<details><summary>${escapeHtml(name)}</summary>${value}</details>`
            : "";
        else if (filter === "type") {
          const expected = tag.includes(":cloze:")
            ? fieldText(cloze(field(name), ordinal, true, true))
            : fieldText(value);
          value = revealed
            ? `<span data-srs-type-answer="${escapeHtml(name)}" data-expected="${escapeHtml(expected)}"></span>`
            : `<input id="typeans" data-srs-type="${escapeHtml(name)}" aria-label="${escapeHtml(name)}" autocomplete="off" spellcheck="false">`;
        } else if (filter.startsWith("tts "))
          value = `<button type="button" data-srs-tts="${escapeHtml(fieldText(value))}" data-lang="${escapeHtml(filter.match(/^tts\s+(\S+)/)?.[1]?.replaceAll("_", "-") || "")}" aria-label="${escapeHtml(name)}">▶</button>`;
      }
      html += value;
    }
    if (end !== undefined) throw new Error(t("card_template_invalid"));
    return html;
  }
  return section();
}

export function renderCard(
  document: CardDocument,
  revealed: boolean,
  options: RenderOptions = {},
): string {
  const { card, note, noteType } = document;
  const template =
    noteType.templates[noteType.kind === "cloze" ? 0 : card.templateOrdinal];
  if (!template) throw new Error(t("card_render_error"));
  const fields: Record<string, string> = {
    Tags: note.tags.join(" "),
    Type: noteType.name,
    Deck: options.deckName || "",
    Subdeck: options.deckName?.split("::").at(-1) || "",
    Card: template.name,
    CardID: card.sourceId || card.id,
    CardFlag: `flag${Number(card.source?.flags || 0) & 7}`,
    SrsSentenceFront: options.front === "sentence" ? "1" : "",
    SrsShowReading: options.showReading === false ? "" : "1",
    SrsShowPartOfSpeech: options.showPartOfSpeech === false ? "" : "1",
    [`c${card.templateOrdinal + 1}`]: "1",
    ...Object.fromEntries(
      noteType.fields.map((field, index) => [
        field.name,
        note.fields[index] || "",
      ]),
    ),
  };
  if (noteType.id.startsWith("reader:")) {
    const study = document.study;
    fields.SrsArticle =
      options.showGenderedArticle === false
        ? ""
        : escapeHtml(study?.article ?? "");
    fields.SrsGrammar = (study?.grammar ?? []).map(escapeHtml).join(" · ");
    fields.SrsPartOfSpeech = (study?.partsOfSpeech ?? [])
      .map(escapeHtml)
      .join(" · ");
    fields.SrsForms = study?.forms.length
      ? `<dl class="srs-forms">${study.forms.map(({ label, value }) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`
      : "";
    const reading = fieldText(fields.Reading ?? "");
    if (isPhoneticReading(reading)) {
      fields.SrsIpa = escapeHtml(reading);
      fields.Reading = "";
    } else fields.SrsIpa = (study?.ipa ?? []).map(escapeHtml).join(" · ");
    fields.SrsFormsLabel = t("study_forms");
    fields.SrsIpaLabel = t("study_ipa");
    fields.SrsExamplesLabel = t("examples");
    if (noteType.bindings.definitions !== undefined) {
      const name = noteType.fields[noteType.bindings.definitions]!.name;
      if (fields.SrsPartOfSpeech)
        fields[name] = fields[name]!.replace(
          /<div\b[^>]*\bdata-srs-pos(?:="[^"]*")?[^>]*>[\s\S]*?<\/div>/gi,
          "",
        );
      if (fields.SrsIpa) {
        const { document } = parseHTML(
          `<html><body>${fields[name]}</body></html>`,
        );
        for (const element of document.querySelectorAll(
          "[data-sc-content],[data-sc-type]",
        ))
          if (
            /(?:^|[\s_-])ipa(?:$|[\s_-])/iu.test(
              [
                element.getAttribute("data-sc-content"),
                element.getAttribute("data-sc-type"),
              ].join(" "),
            )
          ) {
            let parent = element.parentElement;
            element.remove();
            while (parent?.localName === "div" && !parent.hasChildNodes()) {
              const container = parent.parentElement;
              if (container?.matches("section[data-dictionary]"))
                container.remove();
              else parent.remove();
              parent = container;
            }
          }
        fields[name] = document.body.innerHTML;
      }
    }
  }
  const context = { ordinal: card.templateOrdinal, revealed: false };
  const front = renderTemplate(template.front, fields, context);
  return revealed
    ? renderTemplate(
        template.back,
        { FrontSide: front, ...fields },
        { ...context, revealed: true },
      )
    : front;
}
