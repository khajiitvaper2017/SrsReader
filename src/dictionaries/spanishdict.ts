import type {
  Definition,
  LookupResult,
  LookupWord,
} from "@/dictionaries/model";
import { folded } from "@/languages/text";
import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { wordId } from "@/vocabulary/model";
import { z } from "zod";

const baseUrl = "https://www.spanishdict.com/translate/";
const requests = new Map<string, Promise<LookupResult>>();
let retryAt = 0;
export const spanishDictCacheKey = (term: string) => folded(term.trim(), "es");

const labelsSchema = z.array(z.object({ nameEn: z.string() }));
const senseSchema = z.object({
  subheadword: z.string().min(1),
  contextEn: z.string(),
  gender: z.string().nullable(),
  partOfSpeech: z.object({ nameEn: z.string() }),
  regions: labelsSchema,
  registerLabels: labelsSchema,
  translations: z.array(
    z.object({
      translation: z.string(),
      contextEn: z.string(),
      regions: labelsSchema,
      registerLabels: labelsSchema,
      examples: z.array(z.object({ textEs: z.string(), textEn: z.string() })),
    }),
  ),
});
const pageSchema = z.object({
  searchBoxProps: z.object({ isMTPage: z.boolean() }),
  sdDictionaryResultsProps: z.unknown().optional(),
});
const entrySchema = z.object({
  entryLang: z.enum(["es", "en"]),
  entry: z.object({
    neodict: z.array(
      z.object({
        posGroups: z.array(z.object({ senses: z.array(senseSchema) })),
      }),
    ),
  }),
});

export function parseSpanishDict(html: string): LookupResult {
  let entry: z.infer<typeof entrySchema>;
  try {
    const json = html.match(
      /window\.SD_COMPONENT_DATA\s*=\s*(\{[^\n]+\});/u,
    )?.[1];
    const page = pageSchema.parse(JSON.parse(json || ""));
    if (page.searchBoxProps.isMTPage) return { words: [], unresolved: [] };
    entry = entrySchema.parse(page.sdDictionaryResultsProps);
  } catch (error) {
    throw new Error(t("spanishdict_response_unrecognized"), { cause: error });
  }
  if (entry.entryLang !== "es") return { words: [], unresolved: [] };
  const words = new Map<string, LookupWord>();
  for (const dictionary of entry.entry.neodict) {
    for (const group of dictionary.posGroups) {
      for (const sense of group.senses) {
        const lemma = sense.subheadword;
        const id = wordId("es", lemma, "");
        let word = words.get(id);
        if (!word) {
          word = {
            id,
            lemma,
            language: "es",
            reading: "",
            forms: [],
            meanings: [],
          };
          words.set(id, word);
        }
        const gender =
          sense.gender === "M"
            ? "masculine"
            : sense.gender === "F"
              ? "feminine"
              : "";
        const tags = [sense.partOfSpeech.nameEn, gender]
          .filter(Boolean)
          .join(" ");
        let meaning = word.meanings.find((meaning) => meaning.tags === tags);
        if (!meaning) {
          meaning = {
            dictionaryId: "spanishdict",
            title: "SpanishDict",
            revision: "",
            attribution: "SpanishDictionary.com · Dictionary Media Group, Inc.",
            sourceUrl: baseUrl + encodeURIComponent(lemma),
            tags,
            definitions: [],
          };
          word.meanings.push(meaning);
        }
        for (const translation of sense.translations) {
          const notes = [
            ...new Set(
              [
                sense.contextEn,
                translation.contextEn,
                ...sense.regions.map((label) => label.nameEn),
                ...translation.regions.map((label) => label.nameEn),
                ...sense.registerLabels.map((label) => label.nameEn),
                ...translation.registerLabels.map((label) => label.nameEn),
              ].filter(Boolean),
            ),
          ];
          const definition: Definition = {
            type: "structured-content",
            content: [
              {
                tag: "div",
                lang: "en",
                content: [
                  ...(notes.length ? [`(${notes.join("; ")}) `] : []),
                  translation.translation,
                ],
              },
              ...(translation.examples.length
                ? [
                    {
                      tag: "details",
                      content: [
                        { tag: "summary", content: t("examples") },
                        {
                          tag: "ul",
                          content: translation.examples.map((example) => ({
                            tag: "li",
                            content: [
                              {
                                tag: "div",
                                lang: "es",
                                content: example.textEs,
                              },
                              {
                                tag: "div",
                                lang: "en",
                                content: example.textEn,
                              },
                            ],
                          })),
                        },
                      ],
                    },
                  ]
                : []),
            ],
          };
          meaning.definitions.push(definition);
        }
      }
    }
  }
  return {
    words: [...words.values()].filter((word) =>
      word.meanings.some((meaning) => meaning.definitions.length),
    ),
    unresolved: [],
  };
}

export function lookupSpanishDict(
  term: string,
  refresh = false,
): Promise<LookupResult> {
  const key = spanishDictCacheKey(term);
  const pending = requests.get(key);
  if (pending) return pending;
  const request = (async () => {
    if (!refresh) {
      const stored = await db.spanishdict.get(key);
      if (stored) return stored.result;
    }
    return navigator.locks.request("srs-reader-spanishdict", async () => {
      if (!refresh) {
        const stored = await db.spanishdict.get(key);
        if (stored) return stored.result;
      }
      if (retryAt > Date.now())
        throw new Error(
          t("spanishdict_rate_limited", {
            seconds: Math.ceil((retryAt - Date.now()) / 1000),
          }),
        );
      const response = await fetch(baseUrl + encodeURIComponent(key), {
        credentials: "omit",
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const retryTime =
          retryAfter && /^\d+$/u.test(retryAfter)
            ? Date.now() + Number(retryAfter) * 1000
            : Date.parse(retryAfter || "");
        retryAt = Number.isFinite(retryTime)
          ? Math.max(Date.now() + 1000, retryTime)
          : Date.now() + 60000;
        throw new Error(
          t("spanishdict_rate_limited", {
            seconds: Math.ceil((retryAt - Date.now()) / 1000),
          }),
        );
      }
      if (!response.ok && response.status !== 404)
        throw new Error(
          t("spanishdict_request_failed", { status: response.status }),
        );
      const result =
        response.status === 404
          ? { words: [], unresolved: [] }
          : parseSpanishDict(await response.text());
      const aliases = new Map<string, LookupResult>(
        result.words.map((word) => [
          spanishDictCacheKey(word.lemma),
          {
            ...result,
            words: [...result.words].sort(
              (a, b) => Number(b.id === word.id) - Number(a.id === word.id),
            ),
          },
        ]),
      );
      aliases.set(key, result);
      await db.spanishdict.bulkPut(
        [...aliases].map(([term, result]) => ({ term, result })),
      );
      return result;
    });
  })()
    .catch((error) => {
      console.warn("[SrsReader] SpanishDict lookup failed", {
        term: key,
        error,
      });
      throw error;
    })
    .finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}
