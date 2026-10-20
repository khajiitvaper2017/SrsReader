import type {
  Definition,
  LookupResult,
  LookupWord,
} from "@/dictionaries/model";
import { folded } from "@/languages/text";
import { db } from "@/shared/db";
import { t } from "@/shared/i18n/i18n";
import { wordId } from "@/vocabulary/model";
import { DOMParser } from "linkedom";

const baseUrl = "https://www.nechybujte.cz/slovnik-soucasne-cestiny/";
const cache = new Map<string, Promise<LookupResult>>();
export const nechybujteCacheKey = (term: string) =>
  `v2:${folded(term.trim(), "cs")}`;
export function normalizeCzechReflexive(term: string): string {
  const words = term.trim().split(/\s+/u);
  if (words.length === 2 && folded(words[1]!, "cs") === "se")
    return `${words.find((word) => folded(word, "cs") !== "se")!} se`;
  return term.trim();
}

function text(element: Element | null): string {
  if (!element) return "";
  const copy = element.cloneNode(true) as Element;
  copy
    .querySelectorAll("script,style,img,wsnd,mtab,.ex-tooltip")
    .forEach((node) => node.remove());
  return (copy.textContent || "").replace(/[\s\u200b]+/gu, " ").trim();
}

function annotated(element: Element): { text: string; title?: string }[] {
  const title =
    element.querySelector(":scope > .ex-tooltip")?.textContent?.trim() ||
    element.getAttribute("title");
  if (title) return [{ text: text(element), title }];
  return [...element.childNodes].flatMap((node) => {
    if (node.nodeType === 3)
      return [{ text: (node.textContent || "").replace(/[\s\u200b]+/gu, " ") }];
    if (node.nodeType !== 1) return [];
    const child = node as Element;
    if (child.matches("script,style,img,wsnd,mtab,.ex-tooltip")) return [];
    return annotated(child);
  });
}

function content(element: Element | null) {
  return element
    ? annotated(element).map((part) =>
        part.title
          ? { tag: "span", title: part.title, content: part.text }
          : part.text,
      )
    : [];
}

export function parseNechybujte(html: string): LookupResult {
  const document = new DOMParser().parseFromString(html, "text/html");
  const header = document.querySelector("#entry-header");
  const body = document.querySelector("section.main-body");
  if (!header || !body) throw new Error(t("nechybujte_response_unrecognized"));
  const lemma = text(header.querySelector(".lex_ful_entr"));
  if (!lemma) {
    if (body.children.length)
      throw new Error(t("nechybujte_response_unrecognized"));
    return { words: [], unresolved: [] };
  }
  const words: LookupWord[] = [];
  function entry(lemma: string, grammar: Element | null) {
    const grammarNotes = grammar
      ? [...grammar.querySelectorAll(".lex_ful_form,.lex_ful_styl")].flatMap(
          (node) => [...annotated(node), { text: " " }],
        )
      : [];
    const tagDescriptions = Object.fromEntries(
      grammar
        ? [...grammar.querySelectorAll(".ex-tooltip")].map((node) => [
            text(node.parentElement),
            node.textContent?.trim() || "",
          ])
        : [],
    );
    const definitions: Definition[] = [];
    const word: LookupWord = {
      id: wordId("cs", lemma, ""),
      lemma,
      reading: "",
      language: "cs",
      forms: [],
      meanings: [
        {
          dictionaryId: "nechybujte",
          title: "Nechybujte",
          revision: "",
          attribution: "Lingea s.r.o. · Nechybujte.cz",
          sourceUrl: baseUrl + encodeURIComponent(lemma),
          tags: grammar
            ? [...grammar.querySelectorAll(".lex_ful_morf")].map(text).join(" ")
            : "",
          definitions,
          tagDescriptions,
          grammar: grammarNotes,
        },
      ],
    };
    words.push(word);
    return word;
  }
  const root = entry(lemma, document.querySelector("#entry-rest"));
  const defined = new Set<string>();
  for (const child of body.children) {
    if (child.localName === "group") break;
    if (child.localName === "sense") {
      const glossElement = child.querySelector(".lex_desc1,.lex_desc2");
      const gloss = content(glossElement);
      const examples = [
        ...child.querySelectorAll(".lex_samp1,.lex_samp2"),
      ].filter((node) => text(node));
      if (!text(glossElement) && !examples.length) continue;
      defined.add(root.id);
      root.meanings[0]!.definitions.push({
        type: "structured-content",
        content: [
          ...(gloss.length ? [{ tag: "div", content: gloss }] : []),
          ...(examples.length
            ? [
                {
                  tag: "details",
                  content: [
                    { tag: "summary", content: t("examples") },
                    {
                      tag: "ul",
                      content: examples.map((example) => ({
                        tag: "li",
                        content: content(example),
                      })),
                    },
                  ],
                },
              ]
            : []),
        ],
      });
    }
  }
  const found = words.filter((word) => defined.has(word.id));
  if (!found.length) throw new Error(t("nechybujte_response_unrecognized"));
  return { words: found, unresolved: [] };
}

export function lookupNechybujte(
  term: string,
  refresh = false,
): Promise<LookupResult> {
  const lookupKey = folded(normalizeCzechReflexive(term), "cs");
  const key = nechybujteCacheKey(lookupKey);
  const saved = cache.get(key);
  if (saved) return saved;
  const request = (async () => {
    if (!refresh) {
      const stored = await db.nechybujte.get(key);
      if (stored) return stored.result;
    }
    const response = await fetch(baseUrl + encodeURIComponent(lookupKey), {
      credentials: "omit",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok && response.status !== 404)
      throw new Error(
        t("nechybujte_request_failed", { status: response.status }),
      );
    const result =
      response.status === 404
        ? { words: [], unresolved: [] }
        : parseNechybujte(await response.text());
    const aliases = new Map<string, LookupResult>(
      result.words.map((word) => [
        nechybujteCacheKey(word.lemma),
        { words: [word], unresolved: [] },
      ]),
    );
    aliases.set(key, result);
    await db.nechybujte.bulkPut(
      [...aliases].map(([term, result]) => ({ term, result })),
    );
    return result;
  })().finally(() => cache.delete(key));
  cache.set(key, request);
  return request;
}

export function mergeNechybujte(
  local: LookupResult,
  online: LookupResult,
): LookupResult {
  const words = [...local.words];
  for (const word of online.words) {
    const index = words.findIndex((candidate) => candidate.id === word.id);
    if (index < 0) words.push(word);
    else
      words[index] = {
        ...words[index]!,
        meanings: [
          ...words[index]!.meanings.filter(
            (meaning) => meaning.dictionaryId !== "nechybujte",
          ),
          ...word.meanings,
        ],
      };
  }
  return { words, unresolved: words.length ? [] : local.unresolved };
}
