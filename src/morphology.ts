import { browser } from "wxt/browser";
import { folded, normalize } from "./model";

const resources: Record<string, string> = {
  cs: browser.runtime.getURL("/morphology/cs.tsv.gz"),
};
const tables = new Map<string, Promise<Map<string, string>>>();

async function loadTable(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load the local word-form data.");
  const text = await new Response(
    response.body!.pipeThrough(new DecompressionStream("gzip")),
  ).text();
  const table = new Map<string, string>();
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab > 0)
      table.set(normalize(line.slice(0, tab)), normalize(line.slice(tab + 1)));
  }
  return table;
}

export async function analyzeWords(terms: string[], language: string) {
  const results = new Map<string, string>();
  const url = resources[language];
  if (!url || !terms.length) return results;
  if (!tables.has(language)) tables.set(language, loadTable(url));
  const table = await tables.get(language)!;
  for (const term of terms) {
    const lemma =
      table.get(normalize(term)) ?? table.get(folded(term, language));
    if (lemma && lemma !== normalize(term)) results.set(term, lemma);
  }
  return results;
}
