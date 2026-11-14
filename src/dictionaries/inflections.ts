import { db } from "@/platform/database/db";
import { normalize } from "@/languages/text";
import { isInflectionReference, type Meaning } from "@/dictionaries/model";

export type DictionaryInflection = { form: string; labels: string[] };

export async function dictionaryInflections(
  lemma: string,
  meanings: Meaning[],
): Promise<DictionaryInflection[]> {
  const key = normalize(lemma);
  if (!key || !meanings.length) return [];
  const dictionaries = (
    await db.dictionaries.bulkGet([
      ...new Set(meanings.map((meaning) => meaning.dictionaryId)),
    ])
  ).filter((dictionary) => dictionary?.enabled && dictionary.count > 0);
  const references = dictionaries.map((dictionary) =>
    JSON.stringify([dictionary!.revisionId, key]),
  );
  if (!references.length) return [];
  const entries = await db.entryMatches
    .where("lemmaReferences")
    .anyOf(references)
    .toArray();
  const forms = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const definition of entry.definitions) {
      if (
        normalize(definition[0]) !== key ||
        !isInflectionReference(definition)
      )
        continue;
      let labels = forms.get(entry.key);
      if (!labels) forms.set(entry.key, (labels = new Set()));
      for (const label of definition[1]) labels.add(label);
    }
  }
  return [...forms].map(([form, labels]) => ({ form, labels: [...labels] }));
}
