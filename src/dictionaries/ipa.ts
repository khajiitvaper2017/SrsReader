import {
  ipaDefinitions,
  type Dictionary,
  type LookupWord,
  type Meaning,
} from "@/dictionaries/model";
import { listDictionaries } from "@/dictionaries/storage";
import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";

export async function dictionaryIpa(
  word: Pick<LookupWord, "language" | "lemma" | "reading">,
  dictionaries?: Dictionary[],
): Promise<Meaning[]> {
  const enabled = (dictionaries ?? (await listDictionaries())).filter(
    (dictionary) =>
      dictionary.enabled &&
      dictionary.language === word.language &&
      (dictionary.ipaCount ?? 0) > 0,
  );
  if (!enabled.length) return [];
  const key = normalize(word.lemma);
  const reading = normalize(word.reading);
  return db.transaction("r", db.ipa, async () => {
    const meanings = await Promise.all(
      enabled.map(async (dictionary) => {
        const rows = await db.ipa
          .where("[revisionId+folded]")
          .equals([dictionary.revisionId, folded(key, word.language)])
          .toArray();
        const definitions = rows
          .filter(
            (entry) =>
              (word.language !== "de" || entry.key === key) &&
              (!entry.reading ||
                normalize(entry.reading) === key ||
                normalize(entry.reading) === reading),
          )
          .flatMap(ipaDefinitions);
        return definitions.length
          ? [
              {
                dictionaryId: dictionary.id,
                title: dictionary.index.title,
                revision: dictionary.index.revision,
                attribution:
                  dictionary.index.attribution || dictionary.index.author || "",
                sourceUrl: dictionary.index.url || "",
                tags: "ipa",
                definitions,
              },
            ]
          : [];
      }),
    );
    return meanings.flat();
  });
}
