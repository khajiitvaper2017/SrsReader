import type { Dictionary } from "@/dictionaries/model";
import {
  immersionId,
  immersionScore,
  immersionWordId,
  type ImmersionWord,
} from "@/dictionaries/immersion-model";
import { folded, normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import { settingsSchema } from "@/settings/model";
import { saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import Dexie from "dexie";

export function immersionDictionary(
  language: string,
  secondaryWeight = 0.3,
): Dictionary {
  const id = immersionId(language);
  return {
    id,
    revisionId: id,
    language,
    target: "",
    enabled: true,
    order: 0,
    index: {
      title: "Immersion Frequency",
      revision: "1",
      format: 3,
      sourceLanguage: language,
    },
    count: 0,
    frequencyCount: 0,
    maxFrequency: 0,
    imported: Date.now(),
    styles: "",
    immersion: { secondaryWeight },
  };
}

export async function setImmersionCollection(
  language: string,
  enabled: boolean,
) {
  await db.transaction("rw", [db.dictionaries, db.settings], async () => {
    const existing = await db.dictionaries.get(immersionId(language));
    const dictionary = existing ?? immersionDictionary(language);
    if (!existing)
      dictionary.order =
        ((await db.dictionaries.orderBy("order").last())?.order ?? -1) + 1;
    const settings = settingsSchema.parse(
      (await db.settings.get("main"))?.value || {},
    );
    settings.immersionCollection[language] = enabled;
    settings.frequencyPreferences[dictionary.id] ??= {
      enabled: true,
      fallback: false,
      order: dictionary.order,
    };
    await db.dictionaries.put(dictionary);
    await saveSettings(settings);
  });
}

export async function setImmersionWeight(
  language: string,
  secondaryWeight: number,
) {
  await db.transaction("rw", [db.dictionaries, db.immersionWords], async () => {
    const id = immersionId(language);
    const existing = await db.dictionaries.get(id);
    const dictionary = existing ?? immersionDictionary(language);
    if (!existing)
      dictionary.order =
        ((await db.dictionaries.orderBy("order").last())?.order ?? -1) + 1;
    await db.immersionWords
      .where("dictionaryId")
      .equals(id)
      .modify((word) => {
        word.score = immersionScore(word, secondaryWeight);
      });
    await db.dictionaries.put({
      ...dictionary,
      immersion: { secondaryWeight },
    });
  });
}

export async function recordImmersion(
  language: string,
  texts: string[],
  candidates: string[][][],
) {
  const dictionaryId = immersionId(language);
  const records = await Promise.all(
    texts.map(async (text, index) => {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      );
      const fingerprint = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return {
        id: JSON.stringify([dictionaryId, fingerprint]),
        candidates: candidates[index] || [],
      };
    }),
  );
  return db.transaction(
    "rw",
    [db.dictionaries, db.immersionWords, db.immersionPassages, db.settings],
    async () => {
      const settings = settingsSchema.parse(
        (await db.settings.get("main"))?.value || {},
      );
      if (!settings.immersionCollection[language]) return false;
      const dictionary =
        (await db.dictionaries.get(dictionaryId)) ??
        immersionDictionary(language);
      dictionary.order =
        settings.frequencyPreferences[dictionaryId]?.order ?? dictionary.order;
      const increments = new Map<
        string,
        { lemma: string; primaryHits: number; secondaryHits: number }
      >();
      let changed = false;
      for (const record of records) {
        if (await db.immersionPassages.get(record.id)) continue;
        for (const occurrence of record.candidates) {
          const seen = new Set<string>();
          for (const lemma of occurrence) {
            const key = folded(lemma, language);
            if (seen.has(key) || !/\p{L}/u.test(key)) continue;
            const primary = seen.size === 0;
            seen.add(key);
            const count = increments.get(key) || {
              lemma: normalize(lemma),
              primaryHits: 0,
              secondaryHits: 0,
            };
            if (primary) count.primaryHits++;
            else count.secondaryHits++;
            increments.set(key, count);
          }
        }
        await db.immersionPassages.add({ id: record.id, dictionaryId });
        changed = true;
      }
      const keys = [...increments.keys()];
      const previous = await db.immersionWords.bulkGet(
        keys.map((key) => immersionWordId(dictionaryId, key)),
      );
      const words = keys.map((key, index): ImmersionWord => {
        const increment = increments.get(key)!;
        const old = previous[index];
        const word = {
          id: immersionWordId(dictionaryId, key),
          dictionaryId,
          lemma: old?.lemma ?? increment.lemma,
          primaryHits: (old?.primaryHits ?? 0) + increment.primaryHits,
          secondaryHits: (old?.secondaryHits ?? 0) + increment.secondaryHits,
          score: 0,
        };
        word.score = immersionScore(
          word,
          dictionary.immersion!.secondaryWeight,
        );
        return word;
      });
      if (words.length) {
        await db.immersionWords.bulkPut(words);
        const count =
          dictionary.frequencyCount + previous.filter((word) => !word).length;
        await db.dictionaries.put({
          ...dictionary,
          frequencyCount: count,
          maxFrequency: count,
        });
      }
      return changed && words.length > 0;
    },
  );
}

export async function immersionFrequency(
  dictionaryId: string,
  lemma: string,
  language: string,
) {
  const word = await db.immersionWords.get(
    immersionWordId(dictionaryId, folded(lemma, language)),
  );
  if (!word || word.score <= 0) return;
  const above = await db.immersionWords
    .where("[dictionaryId+score]")
    .between(
      [dictionaryId, word.score],
      [dictionaryId, Dexie.maxKey],
      false,
      true,
    )
    .count();
  return {
    rank: above + 1,
    primaryHits: word.primaryHits,
    secondaryHits: word.secondaryHits,
    score: word.score,
  };
}

export async function immersionRanks(dictionaryId: string) {
  const words = await db.immersionWords
    .where("[dictionaryId+score]")
    .between([dictionaryId, 0], [dictionaryId, Dexie.maxKey], false, true)
    .reverse()
    .toArray();
  let rank = 0;
  let score = Infinity;
  return words.map((word, index) => {
    if (word.score !== score) {
      rank = index + 1;
      score = word.score;
    }
    return { ...word, rank };
  });
}

export async function exportImmersionDictionary(dictionary: Dictionary) {
  const rows = await immersionRanks(dictionary.id);
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  await writer.add(
    "index.json",
    new TextReader(
      JSON.stringify({
        ...dictionary.index,
        title: t("immersion_frequency"),
        revision: String(Date.now()),
      }),
    ),
  );
  await writer.add(
    "term_meta_bank_1.json",
    new TextReader(
      JSON.stringify(
        rows.map((word) => [word.lemma, "freq", { value: word.rank }]),
      ),
    ),
  );
  return writer.close();
}
