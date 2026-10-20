import { audioInfoSchema } from "@/audio/model";
import { db } from "@/platform/database/db";
import { settingsSchema } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { saveBlob } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import { reviewSchema } from "@/srs/history";
import { vocabularySchema, wordId } from "@/vocabulary/model";
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { z } from "zod";

export async function exportSettings() {
  const settings = await getSettings();
  for (const dictionary of await db.dictionaries.toArray())
    settings.dictionaryPreferences[dictionary.id] = {
      fallback:
        settings.dictionaryPreferences[dictionary.id]?.fallback ?? false,
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

const learningSchema = z.object({
  format: z.literal("srs-reader-learning"),
  version: z.union([z.literal(1), z.literal(2)]),
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
        version: 2,
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
    if (data.version === 1) {
      for (const word of data.vocabulary) word.srsVersion = word.version;
      data.reviews.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
      for (const [index, review] of data.reviews.entries()) {
        review.sequence = index + 1;
        review.afterSrsVersion = review.afterVersion;
        if (review.before) review.before.srsVersion = review.before.version;
      }
    } else if (
      data.reviews.some((review) => review.sequence < 1) ||
      new Set(data.reviews.map((review) => review.sequence)).size !==
        data.reviews.length
    )
      throw new Error(t("invalid_review_references_in_learning_archive"));
    return { ...data, audio };
  } finally {
    await zip.close();
  }
}
