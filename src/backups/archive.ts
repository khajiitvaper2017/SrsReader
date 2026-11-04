import {
  noteTypeSchema,
  noteSchema,
  cardSchema,
  cardAssetSchema,
  ankiReviewSchema,
  assetId,
} from "@/cards/model";
import { validateCardReferences } from "@/cards/validate";
import { audioInfoSchema } from "@/audio/model";
import { db } from "@/platform/database/db";
import {
  detachRetiredDictionary,
  removeRetiredDictionaryPreferences,
} from "@/platform/database/migrations";
import { settingsSchema } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { saveBlob } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import { reviewSchema } from "@/srs/history";
import { vocabularySchema, wordId } from "@/vocabulary/model";
import { deckSchema } from "@/srs/deck-model";
import { sentenceId, sentenceSchema } from "@/examples/sentence-model";
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
  const {
    studyLanguage: _language,
    nativeLanguage: _nativeLanguage,
    ...settings
  } = await getSettings();
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
  const { settings } = z
    .object({
      format: z.literal("srs-reader-settings"),
      version: z.literal(1),
      settings: settingsSchema,
    })
    .parse(JSON.parse(await file.text()));
  removeRetiredDictionaryPreferences(settings);
  return settings;
}

const learningSchema = z.object({
  format: z.literal("srs-reader-learning"),
  version: z.union([z.literal(5), z.literal(6)]),
  vocabulary: z.array(vocabularySchema),
  noteTypes: z.array(noteTypeSchema),
  notes: z.array(noteSchema),
  cards: z.array(cardSchema),
  decks: z.array(deckSchema),
  sentences: z.array(sentenceSchema),
  reviews: z.array(reviewSchema),
  ankiReviews: z.array(ankiReviewSchema),
  cardAssets: z.array(
    cardAssetSchema.omit({ blob: true }).extend({ path: z.string() }),
  ),
  audio: z.array(
    audioInfoSchema.extend({ path: z.string(), mime: z.string() }),
  ),
});

export async function exportLearning() {
  const snapshot = await db.transaction(
    "r",
    [
      db.vocabulary,
      db.noteTypes,
      db.notes,
      db.cards,
      db.reviews,
      db.ankiReviews,
      db.audio,
      db.cardAssets,
      db.decks,
      db.sentences,
    ],
    async () => ({
      vocabulary: await db.vocabulary.toArray(),
      noteTypes: await db.noteTypes.toArray(),
      notes: await db.notes.toArray(),
      cards: await db.cards.toArray(),
      reviews: await db.reviews.toArray(),
      ankiReviews: await db.ankiReviews.toArray(),
      audio: await db.audio.toArray(),
      cardAssets: await db.cardAssets.toArray(),
      decks: await db.decks.toArray(),
      sentences: await db.sentences.toArray(),
    }),
  );
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  try {
    await writer.add(
      "learning.json",
      new TextReader(
        JSON.stringify({
          ...snapshot,
          format: "srs-reader-learning",
          version: 6,
          audio: snapshot.audio.map(({ blob, ...info }, i) => ({
            ...info,
            path: `audio/${i}`,
            mime: blob.type,
          })),
          cardAssets: snapshot.cardAssets.map(
            ({ blob: _blob, ...info }, i) => ({ ...info, path: `media/${i}` }),
          ),
        }),
      ),
    );
    for (const [i, item] of snapshot.audio.entries())
      await writer.add(`audio/${i}`, new BlobReader(item.blob));
    for (const [i, item] of snapshot.cardAssets.entries())
      await writer.add(`media/${i}`, new BlobReader(item.blob));
    saveBlob(
      await writer.close(),
      `srs-reader-learning-${new Date().toISOString().slice(0, 10)}.zip`,
    );
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}

export async function readLearning(file: File) {
  const zip = new ZipReader(new BlobReader(file));
  try {
    const files = new Map(
      (await zip.getEntries())
        .filter((entry) => !entry.directory)
        .map((entry) => [entry.filename, entry]),
    );
    const json = files.get("learning.json");
    if (!json?.getData)
      throw new Error(t("choose_a_srsreader_learning_archive"));
    const data = learningSchema.parse(
      JSON.parse(await json.getData(new TextWriter())),
    );
    if (
      new Set(data.vocabulary.map((word) => word.id)).size !==
        data.vocabulary.length ||
      data.vocabulary.some(
        (word) => word.id !== wordId(word.language, word.lemma, word.reading),
      )
    )
      throw new Error(t("invalid_word_identities_in_learning_archive"));
    for (const deck of data.decks) detachRetiredDictionary(deck);
    validateCardReferences(
      data.noteTypes,
      data.notes,
      data.cards,
      data.decks,
      data.vocabulary,
    );
    if (
      new Set(data.reviews.map((review) => review.id)).size !==
        data.reviews.length ||
      new Set(data.reviews.map((review) => review.sequence)).size !==
        data.reviews.length ||
      data.reviews.some(
        (review) =>
          review.sequence < 1 ||
          (review.before && review.before.id !== review.cardId),
      )
    )
      throw new Error(t("invalid_review_references_in_learning_archive"));
    if (
      data.sentences.some(
        (sentence) =>
          sentence.id !== sentenceId(sentence.language, sentence.sentence) ||
          sentence.tokens.some(
            (token) =>
              token.end <= token.start || token.end > sentence.sentence.length,
          ),
      )
    )
      throw new Error(t("study_invalid_sentences"));
    const audio = [];
    for (const item of data.audio) {
      const entry = files.get(item.path);
      if (!entry?.getData || !/^audio\/\d+$/.test(item.path))
        throw new Error(t("recording_missing"));
      const { path: _path, mime, ...info } = item;
      audio.push({ ...info, blob: await entry.getData(new BlobWriter(mime)) });
    }
    const cardAssets = [];
    const assetIds = new Set<string>();
    for (const item of data.cardAssets) {
      const entry = files.get(item.path);
      if (
        !entry?.getData ||
        !/^media\/\d+$/.test(item.path) ||
        assetIds.has(item.id) ||
        item.id !== assetId(item.namespace, item.name)
      )
        throw new Error(t("card_media_invalid"));
      assetIds.add(item.id);
      const { path: _path, ...info } = item;
      cardAssets.push({
        ...info,
        blob: await entry.getData(new BlobWriter(item.mime)),
      });
    }
    return { ...data, audio, cardAssets };
  } finally {
    await zip.close();
  }
}
