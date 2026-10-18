import { BlobReader, BlobWriter, TextWriter, ZipReader } from "@zip.js/zip.js";
import { z } from "zod";
import { db } from "./db";
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

export type ImportProgress = { phase: string; done: number; total: number };
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
      throw new Error(
        "This ZIP has no index.json. Choose a Yomitan format-3 dictionary.",
      );
    const index = indexSchema.parse(
      JSON.parse(await indexFile.getData(new TextWriter())),
    );
    language = index.sourceLanguage || language;
    const target = index.targetLanguage || "";
    // Validate the locale before deriving search keys from imported headwords.
    folded("A", language);
    const id = dictionaryId(index.title, language, target);
    if (expectedId && id !== expectedId)
      throw new Error(
        "The downloaded dictionary does not match the installed dictionary.",
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
        phase: `Reading ${file.filename}`,
        done: bankNumber,
        total: totalBanks,
      });
      const rows: unknown = JSON.parse(await file.getData!(new TextWriter()));
      if (!Array.isArray(rows))
        throw new Error(`Invalid term bank: ${file.filename}`);
      for (let offset = 0; offset < rows.length; offset += 1000) {
        const batch: Entry[] = rows
          .slice(offset, offset + 1000)
          .map((row, i) => {
            const parsed = termSchema.safeParse(row);
            if (!parsed.success)
              throw new Error(
                `Invalid entry ${offset + i + 1} in ${file.filename}. Choose a valid Yomitan format-3 dictionary.`,
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
      }
    }
    for (const [bankNumber, file] of metaBanks.entries()) {
      progress({
        phase: `Reading ${file.filename}`,
        done: banks.length + bankNumber,
        total: totalBanks,
      });
      const rows: unknown = JSON.parse(await file.getData!(new TextWriter()));
      if (!Array.isArray(rows))
        throw new Error(`Invalid term metadata bank: ${file.filename}`);
      for (let offset = 0; offset < rows.length; offset += 1000) {
        const batch: Frequency[] = rows
          .slice(offset, offset + 1000)
          .flatMap((row, i) => {
            const parsed = termMetaSchema.safeParse(row);
            if (!parsed.success)
              throw new Error(
                `Invalid metadata entry ${offset + i + 1} in ${file.filename}.`,
              );
            const [term, mode, data] = parsed.data;
            if (mode !== "freq") return [];
            const frequency = frequencyDataSchema.safeParse(data);
            if (!frequency.success)
              throw new Error(
                `Invalid frequency entry ${offset + i + 1} in ${file.filename}.`,
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
      }
    }
    if (!count && !frequencyCount)
      throw new Error("This ZIP contains no terms or numeric frequencies.");
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
        phase: "Saving dictionary media",
        done: i,
        total: media.length,
      });
      if (file.filename.split("/").includes(".."))
        throw new Error("Invalid dictionary media path.");
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
        existing?.order ?? preference?.order ?? (await db.dictionaries.count()),
      count,
      frequencyCount,
      maxFrequency,
      imported: Date.now(),
      styles,
    };
    progress({
      phase: "Activating dictionary",
      done: totalBanks,
      total: totalBanks,
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
    throw new Error("This dictionary has no update source.");
  const response = await fetch(httpsUrl(dictionary.index.indexUrl), {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Update check failed (${response.status}).`);
  const index = indexSchema.parse(await response.json());
  if (
    dictionaryId(
      index.title,
      index.sourceLanguage || dictionary.language,
      index.targetLanguage || "",
    ) !== dictionary.id
  )
    throw new Error("The update index identifies a different dictionary.");
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
