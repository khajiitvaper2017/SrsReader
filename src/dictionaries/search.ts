import type { Request, Responses } from "@/dictionaries/contracts";
import { activeDictionaries } from "@/dictionaries/lookup";
import { folded } from "@/languages/text";
import { db } from "@/platform/database/db";

export async function searchDictionaries({
  query,
  language,
  mode,
  offset,
}: Extract<Request, { action: "searchDictionaries" }>): Promise<
  Responses["searchDictionaries"]
> {
  const dictionaries = await activeDictionaries(language);
  const byRevision = new Map(dictionaries.map((d) => [d.revisionId, d]));
  const wordQuery = folded(query, language);
  const definitionQueries = new Map(
    dictionaries.map((d) => [d.revisionId, folded(query, d.target)]),
  );
  // shortcut: substring search scans entries on submit; add a text index if large dictionaries make it slow.
  const entries = await db.entries
    .where("revisionId")
    .anyOf([...byRevision.keys()])
    .filter((entry) => {
      const definitions = entry.definitions.filter((d) => !Array.isArray(d));
      if (!definitions.length) return false;
      if (mode === "word")
        return (
          entry.folded.includes(wordQuery) ||
          folded(entry.reading, language).includes(wordQuery)
        );
      const dictionary = byRevision.get(entry.revisionId)!;
      return folded(searchText(definitions), dictionary.target).includes(
        definitionQueries.get(entry.revisionId)!,
      );
    })
    .offset(offset)
    .limit(51)
    .toArray();
  return {
    hasMore: entries.length > 50,
    entries: entries.slice(0, 50).map((entry) => {
      const dictionary = byRevision.get(entry.revisionId)!;
      return {
        id: entry.id,
        key: entry.key,
        reading: entry.reading,
        meaning: {
          dictionaryId: dictionary.id,
          title: dictionary.index.title,
          revision: dictionary.index.revision,
          attribution:
            dictionary.index.attribution || dictionary.index.author || "",
          sourceUrl: dictionary.index.url || "",
          tags: entry.tags,
          definitions: entry.definitions.filter((d) => !Array.isArray(d)),
        },
      };
    }),
  };
}

function searchText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(searchText).join(" ");
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  return searchText(node.content ?? node.text);
}
