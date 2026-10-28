import {
  immersionArchiveSchema,
  immersionScore,
} from "@/dictionaries/immersion-model";
import { cardMediaInfoSchema } from "@/media/model";
import { audioInfoSchema } from "@/audio/model";
import { db } from "@/platform/database/db";
import { settingsSchema } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { saveBlob } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import { reviewSchema } from "@/srs/history";
import { contextSchema, vocabularySchema, wordId } from "@/vocabulary/model";
import { deckSchema } from "@/srs/deck-model";
import {
  mergeSentence,
  sentenceFromContext,
  sentenceId,
  sentenceSchema,
} from "@/examples/sentence-model";
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
  return z
    .object({
      format: z.literal("srs-reader-settings"),
      version: z.literal(1),
      settings: settingsSchema,
    })
    .parse(JSON.parse(await file.text())).settings;
}

const archivedWordSchema = vocabularySchema.extend({
  contexts: z.array(contextSchema).optional(),
});
const learningSchema = z.object({
  format: z.literal("srs-reader-learning"),
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  immersion: z.array(immersionArchiveSchema).default([]),
  vocabulary: z.array(archivedWordSchema),
  decks: z.array(deckSchema).default([]),
  sentences: z.array(sentenceSchema).default([]),
  reviews: z.array(
    reviewSchema.extend({
      before: z
        .union([
          archivedWordSchema,
          reviewSchema.shape.before
            .unwrap()
            .extend({ contexts: z.array(contextSchema).optional() }),
        ])
        .nullable(),
    }),
  ),
  cardMedia: z
    .array(cardMediaInfoSchema.safeExtend({ path: z.string() }))
    .default([]),
  audio: z.array(
    audioInfoSchema.extend({ path: z.string(), mime: z.string() }),
  ),
});

export async function exportLearning() {
  const snapshot = await db.transaction(
    "r",
    [
      db.vocabulary,
      db.reviews,
      db.audio,
      db.cardMedia,
      db.decks,
      db.sentences,
      db.dictionaries,
      db.immersionWords,
      db.immersionPassages,
    ],
    async () => ({
      immersion: await Promise.all(
        (await db.dictionaries.toArray())
          .filter((dictionary) => dictionary.immersion)
          .map(async (dictionary) => ({
            language: dictionary.language,
            secondaryWeight: dictionary.immersion!.secondaryWeight,
            words: await db.immersionWords
              .where("dictionaryId")
              .equals(dictionary.id)
              .toArray(),
            passages: await db.immersionPassages
              .where("dictionaryId")
              .equals(dictionary.id)
              .toArray(),
          })),
      ),
      vocabulary: await db.vocabulary.toArray(),
      reviews: await db.reviews.toArray(),
      audio: await db.audio.toArray(),
      cardMedia: await db.cardMedia.toArray(),
      decks: await db.decks.toArray(),
      sentences: await db.sentences.toArray(),
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
        version: 4,
        immersion: snapshot.immersion,
        vocabulary: snapshot.vocabulary,
        decks: snapshot.decks,
        sentences: snapshot.sentences,
        reviews: snapshot.reviews,
        audio,
        cardMedia: snapshot.cardMedia.map(({ blob: _blob, ...info }, i) => ({
          ...info,
          path: `media/${i}`,
        })),
      }),
    ),
  );
  for (const [i, item] of snapshot.audio.entries())
    await writer.add(`audio/${i}`, new BlobReader(item.blob));
  for (const [i, item] of snapshot.cardMedia.entries())
    await writer.add(`media/${i}`, new BlobReader(item.blob));
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
    if (
      new Set(data.immersion.map((source) => source.language)).size !==
      data.immersion.length
    )
      throw new Error(t("invalid_immersion_archive"));
    for (const source of data.immersion)
      for (const word of source.words)
        word.score = immersionScore(word, source.secondaryWeight);
    const ids = new Set(data.vocabulary.map((w) => w.id));
    const words = new Map(data.vocabulary.map((word) => [word.id, word]));
    if (
      new Set(data.decks.map((deck) => deck.id)).size !== data.decks.length ||
      data.decks.some((deck) =>
        deck.wordIds.some((id) => words.get(id)?.language !== deck.language),
      )
    )
      throw new Error(t("study_invalid_decks"));
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
    const sentences = new Map(
      data.sentences.map((sentence) => [sentence.id, sentence]),
    );
    for (const word of [
      ...data.vocabulary,
      ...data.reviews.flatMap((review) =>
        review.before ? [review.before] : [],
      ),
    ]) {
      for (const context of ("contexts" in word ? word.contexts : []) || []) {
        const sentence = sentenceFromContext(word.language, context, word.id);
        sentences.set(
          sentence.id,
          mergeSentence(sentences.get(sentence.id), sentence),
        );
      }
      if ("contexts" in word) delete word.contexts;
    }
    data.sentences = [...sentences.values()];
    if (
      ids.size !== data.vocabulary.length ||
      data.vocabulary.some(
        (w) => w.id !== wordId(w.language, w.lemma, w.reading),
      )
    )
      throw new Error(t("invalid_word_identities_in_learning_archive"));
    if (
      new Set(data.reviews.map((r) => r.id)).size !== data.reviews.length ||
      data.reviews.some((r) => {
        const identity = z
          .tuple([z.string(), z.string().min(1), z.string()])
          .parse(JSON.parse(r.wordId));
        return (
          r.wordId !== wordId(...identity) ||
          (r.before && r.before.id !== r.wordId)
        );
      })
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
    if (
      new Set(data.cardMedia.map((item) => item.id)).size !==
        data.cardMedia.length ||
      data.cardMedia.some((item) => !ids.has(item.wordId))
    )
      throw new Error(t("card_media_invalid"));
    const cardMedia = [];
    for (const item of data.cardMedia) {
      const entry = files.find((file) => file.filename === item.path);
      if (!entry?.getData || !/^media\/\d+$/.test(item.path))
        throw new Error(t("card_media_unavailable"));
      const { path: _path, ...info } = item;
      const blob = await entry.getData(new BlobWriter(info.mime));
      if (!blob.size) throw new Error(t("card_media_invalid"));
      cardMedia.push({ ...info, blob });
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
    return { ...data, audio, cardMedia };
  } finally {
    await zip.close();
  }
}
