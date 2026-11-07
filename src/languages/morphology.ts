import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";

let cached:
  | { language: string; updated: number; table: Promise<Map<string, string>> }
  | undefined;

export async function analyzeWords(terms: string[], language: string) {
  const results = new Map<string, string>();
  if (!terms.length) return results;
  const record = await db.morphology.get(language);
  if (!record) return results;
  if (cached?.language !== language || cached.updated !== record.updated) {
    cached = {
      language,
      updated: record.updated,
      table: new Response(
        record.data.stream().pipeThrough(new DecompressionStream("gzip")),
      )
        .json()
        .then((rows: [string, string][]) => new Map(rows)),
    };
  }
  const current = cached;
  let table: Map<string, string>;
  try {
    table = await current.table;
  } catch (error) {
    if (cached === current) cached = undefined;
    throw error;
  }
  for (const term of terms) {
    const lemma =
      table.get(normalize(term)) ?? table.get(folded(term, language));
    if (lemma && lemma !== normalize(term)) results.set(term, lemma);
  }
  return results;
}
