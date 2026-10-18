import { t } from "./i18n";
import { BlobReader, BlobWriter, TextWriter, ZipReader } from "@zip.js/zip.js";
import { z } from "zod";
import { db } from "./db";
import { languageCode } from "./languages";
import {
  dictionaryId,
  folded,
  indexSchema,
  normalize,
  termSchema,
  termMetaSchema,
  frequencyDataSchema,
  httpsUrl,
  type Dictionary,
  type Entry,
  type Frequency,
} from "./model";

export type ImportProgress = {
  phase: string;
  done: number;
  total: number;
  unit?: "bytes";
};
const tagSchema = z.tuple([
  z.string(),
  z.string(),
  z.number(),
  z.string(),
  z.number(),
]);

export async function removeRevision(id: string) {
  await db.transaction(
    "rw",
    [
      db.entries,
      db.frequencies,
      db.tags,
      db.dictionaryMedia,
      db.archives,
      db.phrases,
    ],
    async () => {
      await db.entries.where("revisionId").equals(id).delete();
      await db.frequencies.where("revisionId").equals(id).delete();
      await db.tags.where("revisionId").equals(id).delete();
      await db.dictionaryMedia.where("revisionId").equals(id).delete();
      await db.archives.delete(id);
      await db.phrases.where("revisionId").equals(id).delete();
    },
  );
}

export async function importDictionary(
  blob: Blob,
  language: string,
  progress: (value: ImportProgress) => void,
  expectedId?: string,
) {
  return navigator.locks.request("srs-reader-dictionary-write", async () => {
    const active = new Set(
      (await db.dictionaries.toArray()).map((d) => d.revisionId),
    );
    const revisions = new Set([
      ...(await db.entries.orderBy("revisionId").uniqueKeys()),
      ...(await db.frequencies.orderBy("revisionId").uniqueKeys()),
    ]);
    for (const revision of revisions)
      if (!active.has(String(revision))) await removeRevision(String(revision));
    return importRevision(blob, language, progress, expectedId);
  });
}
async function importRevision(
  blob: Blob,
  language: string,
  progress: (value: ImportProgress) => void,
  expectedId?: string,
) {
  const zip = new ZipReader(new BlobReader(blob));
  const revisionId = crypto.randomUUID();
  let activated = false;
  try {
    const files = (await zip.getEntries()).filter((f) => !f.directory);
    const indexFile = files.find((f) => f.filename === "index.json");
    if (!indexFile?.getData)
      throw new Error(t("this_zip_has_no_index_json_choose_a"));
    const index = indexSchema.parse(
      JSON.parse(await indexFile.getData(new TextWriter())),
    );
    language = languageCode(index.sourceLanguage || language);
    const target = index.targetLanguage
      ? languageCode(index.targetLanguage)
      : "";
    // Validate the locale before deriving search keys from imported headwords.
    folded("A", language);
    const id = dictionaryId(index.title, language, target);
    if (expectedId && id !== expectedId)
      throw new Error(
        t("the_downloaded_dictionary_does_not_match_the_installed"),
      );
    const existing = await db.dictionaries.get(id);
    const preference = (await db.settings.get("main"))?.value
      .dictionaryPreferences?.[id];
    const banks = files.filter((f) => /^term_bank_\d+\.json$/.test(f.filename));
    const metaBanks = files.filter((f) =>
      /^term_meta_bank_\d+\.json$/.test(f.filename),
    );
    const totalBanks = banks.length + metaBanks.length;
    let count = 0;
    let frequencyCount = 0;
    let maxFrequency = 0;
    const segmenter = new Intl.Segmenter(language, { granularity: "word" });
    for (const [bankNumber, file] of banks.entries()) {
      progress({
        phase: t("reading", { filename: file.filename }),
        done: bankNumber,
        total: totalBanks,
      });
      const rows: unknown = JSON.parse(await file.getData!(new TextWriter()));
      if (!Array.isArray(rows))
        throw new Error(t("invalid_term_bank", { filename: file.filename }));
      for (let offset = 0; offset < rows.length; offset += 1000) {
        const batch: Entry[] = rows
          .slice(offset, offset + 1000)
          .map((row, i) => {
            const parsed = termSchema.safeParse(row);
            if (!parsed.success)
              throw new Error(
                t("invalid_entry_in_choose_a_valid_yomitan_format", {
                  value1: offset + i + 1,
                  filename: file.filename,
                }),
              );
            const [lemma, reading, tags, , , definitions, sequence, termTags] =
              parsed.data;
            return {
              id: `${revisionId}:${count++}`,
              revisionId,
              key: normalize(lemma),
              folded: folded(lemma, language),
              reading: normalize(reading),
              tags: [tags, termTags].filter(Boolean).join(" "),
              definitions,
              sequence,
            };
          });
        await db.entries.bulkAdd(batch);
        const phrases = batch.flatMap((entry) => {
          const segments = [...segmenter.segment(entry.folded)].filter(
            (s) => s.isWordLike,
          );
          return segments.length > 1
            ? [
                {
                  id: `${revisionId}:${entry.folded}`,
                  revisionId,
                  first: segments[0]!.segment,
                  text: entry.folded,
                },
              ]
            : [];
        });
        await db.phrases.bulkPut(phrases);
        progress({
          phase: t("reading", { filename: file.filename }),
          done: bankNumber + Math.min(offset + 1000, rows.length) / rows.length,
          total: totalBanks,
        });
      }
    }
    for (const [bankNumber, file] of metaBanks.entries()) {
      progress({
        phase: t("reading", { filename: file.filename }),
        done: banks.length + bankNumber,
        total: totalBanks,
      });
      const rows: unknown = JSON.parse(await file.getData!(new TextWriter()));
      if (!Array.isArray(rows))
        throw new Error(
          t("invalid_term_metadata_bank", { filename: file.filename }),
        );
      for (let offset = 0; offset < rows.length; offset += 1000) {
        const batch: Frequency[] = rows
          .slice(offset, offset + 1000)
          .flatMap((row, i) => {
            const parsed = termMetaSchema.safeParse(row);
            if (!parsed.success)
              throw new Error(
                t("invalid_metadata_entry_in", {
                  value1: offset + i + 1,
                  filename: file.filename,
                }),
              );
            const [term, mode, data] = parsed.data;
            if (mode !== "freq") return [];
            const frequency = frequencyDataSchema.safeParse(data);
            if (!frequency.success)
              throw new Error(
                t("invalid_frequency_entry_in", {
                  value1: offset + i + 1,
                  filename: file.filename,
                }),
              );
            const payload = frequency.data;
            const hasReading =
              typeof payload === "object" && "reading" in payload;
            const value = hasReading ? payload.frequency : payload;
            const rank =
              typeof value === "object"
                ? value.value
                : typeof value === "string"
                  ? Number(value.trim().replaceAll(",", "") || NaN)
                  : value;
            if (!Number.isFinite(rank) || rank < 0) return [];
            maxFrequency = Math.max(maxFrequency, rank);
            return [
              {
                id: `${revisionId}:${frequencyCount++}`,
                revisionId,
                key: normalize(term),
                folded: folded(term, language),
                reading: hasReading ? normalize(payload.reading) : null,
                rank,
              },
            ];
          });
        await db.frequencies.bulkAdd(batch);
        progress({
          phase: t("reading", { filename: file.filename }),
          done:
            banks.length +
            bankNumber +
            Math.min(offset + 1000, rows.length) / rows.length,
          total: totalBanks,
        });
      }
    }
    if (!count && !frequencyCount)
      throw new Error(t("this_zip_contains_no_terms_or_numeric_frequencies"));
    for (const file of files.filter((f) =>
      /^tag_bank_\d+\.json$/.test(f.filename),
    )) {
      const rows = z
        .array(tagSchema)
        .parse(JSON.parse(await file.getData!(new TextWriter())));
      await db.tags.bulkPut(
        rows.map(([name, category, , description]) => ({
          id: `${revisionId}:${name}`,
          revisionId,
          name,
          category,
          description,
        })),
      );
    }
    const stylesFile = files.find((f) => f.filename === "styles.css");
    const styles = stylesFile?.getData
      ? await stylesFile.getData(new TextWriter())
      : "";
    const media = files.filter(
      (f) => !f.directory && !/\.json$|\.css$/i.test(f.filename),
    );
    for (const [i, file] of media.entries()) {
      progress({
        phase: t("saving_dictionary_media"),
        done: i,
        total: media.length,
      });
      if (file.filename.split("/").includes(".."))
        throw new Error(t("invalid_dictionary_media_path"));
      await db.dictionaryMedia.put({
        id: `${revisionId}:${file.filename}`,
        revisionId,
        path: file.filename,
        blob: await file.getData!(new BlobWriter()),
      });
    }
    const dictionary: Dictionary = {
      id,
      revisionId,
      index,
      language,
      target,
      enabled: existing?.enabled ?? preference?.enabled ?? true,
      order:
        existing?.order ??
        preference?.order ??
        ((await db.dictionaries.orderBy("order").last())?.order ?? -1) + 1,
      count,
      frequencyCount,
      maxFrequency,
      imported: Date.now(),
      styles,
    };
    progress({
      phase: t("activating_dictionary"),
      done: 0,
      total: 0,
    });
    await db.transaction("rw", [db.dictionaries, db.archives], async () => {
      await db.archives.put({ id: revisionId, blob });
      await db.dictionaries.put(dictionary);
    });
    activated = true;
    if (existing)
      await removeRevision(existing.revisionId).catch(console.error);
    return dictionary;
  } finally {
    await zip.close();
    if (!activated) await removeRevision(revisionId);
  }
}

export async function checkUpdate(dictionary: Dictionary) {
  if (!dictionary.index.isUpdatable || !dictionary.index.indexUrl)
    throw new Error(t("this_dictionary_has_no_update_source"));
  const response = await fetch(httpsUrl(dictionary.index.indexUrl), {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(t("update_check_failed", { status: response.status }));
  const index = indexSchema.parse(await response.json());
  if (
    dictionaryId(
      index.title,
      languageCode(index.sourceLanguage || dictionary.language),
      index.targetLanguage ? languageCode(index.targetLanguage) : "",
    ) !== dictionary.id
  )
    throw new Error(t("the_update_index_identifies_a_different_dictionary"));
  return new Intl.Collator("en", { numeric: true }).compare(
    index.revision,
    dictionary.index.revision,
  ) > 0
    ? {
        revision: index.revision,
        url: httpsUrl(index.downloadUrl || dictionary.index.downloadUrl || ""),
      }
    : null;
}
