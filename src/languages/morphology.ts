import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";

let cached:
  { language: string; updated: number; table: Map<string, string> } | undefined;

export async function analyzeWords(terms: string[], language: string) {
  const results = new Map<string, string>();
  if (!terms.length) return results;
  const record = await db.morphology.get(language);
  if (!record) return results;
  if (cached?.language !== language || cached.updated !== record.updated) {
    const rows = (await new Response(
      record.data.stream().pipeThrough(new DecompressionStream("gzip")),
    ).json()) as [string, string][];
    cached = { language, updated: record.updated, table: new Map(rows) };
  }
  for (const term of terms) {
    const lemma =
      cached.table.get(normalize(term)) ??
      cached.table.get(folded(term, language));
    if (lemma && lemma !== normalize(term)) results.set(term, lemma);
  }
  return results;
}
