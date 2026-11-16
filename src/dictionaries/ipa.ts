import {
  ipaDefinitions,
  type Dictionary,
  type LookupWord,
  type Meaning,
} from "@/dictionaries/model";
import { listDictionaries } from "@/dictionaries/storage";
import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import { preferredIpaMeanings } from "@/dictionaries/pronunciation";

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
  return db.transaction("r", [db.ipa, db.tags], async () => {
    const sources = await Promise.all(
      enabled.map(async (dictionary) => {
        const rows = await db.ipa
          .where("[revisionId+folded]")
          .equals([dictionary.revisionId, folded(key, word.language)])
          .toArray();
        const entries = rows.filter(
          (entry) =>
            (word.language !== "de" || entry.key === key) &&
            (!entry.reading ||
              normalize(entry.reading) === key ||
              normalize(entry.reading) === reading),
        );
        const tags = [
          ...new Set(
            entries.flatMap((entry) =>
              entry.transcriptions.flatMap(
                (transcription) => transcription.tags ?? [],
              ),
            ),
          ),
        ];
        const descriptions = Object.fromEntries(
          (
            await db.tags.bulkGet(
              tags.map((tag) => `${dictionary.revisionId}:${tag}`),
            )
          ).flatMap((tag) =>
            tag?.description ? [[tag.name, tag.description]] : [],
          ),
        );
        const definitions = entries.flatMap((entry) =>
          ipaDefinitions(entry, descriptions),
        );
        return {
          merged: dictionary.index.downloadUrl?.includes("/dict/all/") ?? false,
          meanings: definitions.length
            ? [
                {
                  dictionaryId: dictionary.id,
                  title: dictionary.index.title,
                  revision: dictionary.index.revision,
                  attribution:
                    dictionary.index.attribution ||
                    dictionary.index.author ||
                    "",
                  sourceUrl: dictionary.index.url || "",
                  tags: "ipa",
                  definitions,
                },
              ]
            : [],
        };
      }),
    );
    return preferredIpaMeanings(sources);
  });
}
