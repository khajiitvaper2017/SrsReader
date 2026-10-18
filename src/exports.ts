import { t } from "./i18n";
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { z } from "zod";
import { db } from "./db";
import {
  audioInfoSchema,
  reviewSchema,
  settingsSchema,
  vocabularySchema,
  wordId,
} from "./model";
import { getSettings } from "./srs";

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportSettings() {
  const settings = await getSettings();
  for (const dictionary of await db.dictionaries.toArray())
    settings.dictionaryPreferences[dictionary.id] = {
      enabled: dictionary.enabled,
      order: dictionary.order,
    };
  saveBlob(
    new Blob(
      [
        JSON.stringify(
          { format: "srs-reader-settings", version: 1, settings },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    "srs-reader-settings.json",
  );
}
export async function readSettings(file: File) {
  return z
    .object({
      format: z.literal("srs-reader-settings"),
      version: z.literal(1),
      settings: settingsSchema,
    })
    .parse(JSON.parse(await file.text())).settings;
}
export async function restoreSettings(
  settings: ReturnType<typeof settingsSchema.parse>,
) {
  await db.transaction("rw", [db.settings, db.dictionaries], async () => {
    await db.settings.put({ id: "main", value: settings });
    for (const [id, preference] of Object.entries(
      settings.dictionaryPreferences,
    ))
      await db.dictionaries.update(id, preference);
  });
}
const learningSchema = z.object({
  format: z.literal("srs-reader-learning"),
  version: z.literal(1),
  vocabulary: z.array(vocabularySchema),
  reviews: z.array(reviewSchema),
  audio: z.array(
    audioInfoSchema.extend({ path: z.string(), mime: z.string() }),
  ),
});
export async function exportLearning() {
  const snapshot = await db.transaction(
    "r",
    [db.vocabulary, db.reviews, db.audio],
    async () => ({
      vocabulary: await db.vocabulary.toArray(),
      reviews: await db.reviews.toArray(),
      audio: await db.audio.toArray(),
    }),
  );
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  const audio = snapshot.audio.map(({ blob, ...info }, i) => ({
    ...info,
    path: `audio/${i}`,
    mime: blob.type,
  }));
  await writer.add(
    "learning.json",
    new TextReader(
      JSON.stringify({
        format: "srs-reader-learning",
        version: 1,
        vocabulary: snapshot.vocabulary,
        reviews: snapshot.reviews,
        audio,
      }),
    ),
  );
  for (const [i, item] of snapshot.audio.entries())
    await writer.add(`audio/${i}`, new BlobReader(item.blob));
  saveBlob(
    await writer.close(),
    `srs-reader-learning-${new Date().toISOString().slice(0, 10)}.zip`,
  );
}
export async function readLearning(file: File) {
  const zip = new ZipReader(new BlobReader(file));
  try {
    const files = (await zip.getEntries()).filter((f) => !f.directory);
    const json = files.find((f) => f.filename === "learning.json");
    if (!json?.getData)
      throw new Error(t("choose_a_srsreader_learning_archive"));
    const data = learningSchema.parse(
      JSON.parse(await json.getData(new TextWriter())),
    );
    const ids = new Set(data.vocabulary.map((w) => w.id));
    if (
      ids.size !== data.vocabulary.length ||
      data.vocabulary.some(
        (w) => w.id !== wordId(w.language, w.lemma, w.reading),
      )
    )
      throw new Error(t("invalid_word_identities_in_learning_archive"));
    if (
      new Set(data.reviews.map((r) => r.id)).size !== data.reviews.length ||
      data.reviews.some(
        (r) => !ids.has(r.wordId) || (r.before && r.before.id !== r.wordId),
      )
    )
      throw new Error(t("invalid_review_references_in_learning_archive"));
    if (
      new Set(data.audio.map((a) => a.id)).size !== data.audio.length ||
      data.audio.some(
        (a) => a.id !== wordId(a.language, a.lemma, JSON.parse(a.id)[2] || ""),
      )
    )
      throw new Error(t("invalid_audio_identities_in_learning_archive"));
    const audio = [];
    for (const item of data.audio) {
      const entry = files.find((f) => f.filename === item.path);
      if (!entry?.getData || !/^audio\/\d+$/.test(item.path))
        throw new Error(t("recording_missing"));
      const { path, mime, ...info } = item;
      audio.push({ ...info, blob: await entry.getData(new BlobWriter(mime)) });
    }
    return { ...data, audio };
  } finally {
    await zip.close();
  }
}
export async function restoreLearning(
  data: Awaited<ReturnType<typeof readLearning>>,
) {
  await db.transaction(
    "rw",
    [db.vocabulary, db.reviews, db.audio],
    async () => {
      await db.vocabulary.clear();
      await db.reviews.clear();
      await db.audio.clear();
      await db.vocabulary.bulkAdd(data.vocabulary);
      await db.reviews.bulkAdd(data.reviews);
      await db.audio.bulkAdd(data.audio);
    },
  );
}
