import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { t } from "@/shared/i18n/i18n";
import { cardMediaId, cardMediaSchema, type CardMedia } from "@/media/model";
import { assetId, type Card } from "@/cards/model";
import {
  ensureReaderCard,
  fieldText,
  getCardDocument,
  readingCard,
} from "@/cards/storage";
import { escapeHtml } from "@/cards/snapshot";

const bindingFor = (kind: CardMedia["kind"]) =>
  kind === "background"
    ? "image"
    : kind === "wordAudio"
      ? "wordAudio"
      : "sentenceAudio";
const sentenceAudioName = (sentence: string) =>
  `_srs_sentence_audio_${encodeURIComponent(sentence)}`;

async function mediaDocument(wordId: string, noteId?: string) {
  const card = noteId
    ? await db.cards.where("noteId").equals(noteId).first()
    : await readingCard(wordId);
  const document = card && (await getCardDocument(card.id));
  return document?.note.wordId === wordId ? document : undefined;
}

export async function preferredCardAudio(cardId: string) {
  const card = await db.cards.get(cardId);
  const preference = card?.preferredAudio;
  if (!preference) return;
  if ("voice" in preference) return preference;
  const note = await db.notes.get(card!.noteId);
  if (!note) return;
  const asset = await db.cardAssets.get(
    assetId(note.mediaNamespace, preference.recording),
  );
  return asset && { blob: asset.blob };
}

export function chooseCardAudio(cardId: string, choice?: Blob | string) {
  return srsWrite(() =>
    db.transaction("rw", [db.cards, db.notes, db.cardAssets], async () => {
      const card = await db.cards.get(cardId);
      if (!card) return;
      const note = await db.notes.get(card.noteId);
      if (!note) return;
      let preferredAudio: Card["preferredAudio"] =
        typeof choice === "string" ? { voice: choice } : undefined;
      if (choice instanceof Blob) {
        const name = `_srs_pronunciation_${crypto.randomUUID()}`;
        await db.cardAssets.put({
          id: assetId(note.mediaNamespace, name),
          namespace: note.mediaNamespace,
          name,
          mime: choice.type,
          blob: choice,
        });
        preferredAudio = { recording: name };
      }
      if (preferredAudio || card.preferredAudio) {
        await db.cards.update(cardId, {
          preferredAudio,
          updated: Date.now(),
          version: card.version + 1,
        });
      }
      if (card.preferredAudio && "recording" in card.preferredAudio)
        await db.cardAssets.delete(
          assetId(note.mediaNamespace, card.preferredAudio.recording),
        );
    }),
  );
}

export async function getCardMedia(
  wordId: string,
  kind: CardMedia["kind"],
  sentence = "",
  noteId?: string,
): Promise<CardMedia | undefined> {
  const document = await mediaDocument(wordId, noteId);
  if (!document) return;
  const index = document.noteType.bindings[bindingFor(kind)];
  if (index === undefined) return;
  const value = document.note.fields[index] || "";
  const name =
    value.match(/\[sound:([^\]]+)\]/)?.[1] ??
    value.match(/\bsrc="([^"]+)"/)?.[1];
  const sentenceIndex = document.noteType.bindings.sentence;
  const primary =
    kind !== "audio" ||
    sentenceIndex === undefined ||
    !sentence ||
    fieldText(document.note.fields[sentenceIndex] || "") === sentence;
  let asset =
    kind === "audio" && !primary
      ? await db.cardAssets.get(
          assetId(document.note.mediaNamespace, sentenceAudioName(sentence)),
        )
      : undefined;
  if (
    asset &&
    !document.note.fields.some((field) =>
      field.includes(`[sound:${asset!.name}]`),
    )
  )
    asset = undefined;
  if (!asset && kind === "audio" && !primary) {
    const prefix = `saved-audio-${encodeURIComponent(sentence)}-`;
    asset = await db.cardAssets
      .where("[namespace+name]")
      .between(
        [document.note.mediaNamespace, prefix],
        [document.note.mediaNamespace, `${prefix}\uffff`],
      )
      .first();
    if (
      asset &&
      !document.note.fields.some((field) =>
        field.includes(`[sound:${asset!.name}]`),
      )
    )
      asset = undefined;
  }
  if (!asset && primary)
    asset = name
      ? await db.cardAssets.get(
          assetId(document.note.mediaNamespace, fieldText(name)),
        )
      : undefined;
  if (!asset) return;
  return {
    id: cardMediaId(wordId, kind, sentence),
    wordId,
    kind,
    sentence: kind === "audio" ? sentence : "",
    name: asset.name,
    mime: asset.mime as CardMedia["mime"],
    blob: asset.blob,
  };
}

// Files stay in IndexedDB: browser runtime messages do not preserve Blob values.
export async function saveCardMedia(
  wordId: string,
  kind: CardMedia["kind"],
  sentence: string,
  file: File | null,
  noteId?: string,
) {
  const id = cardMediaId(wordId, kind, sentence);
  const record = file
    ? cardMediaSchema.safeParse({
        id,
        wordId,
        kind,
        sentence: kind === "audio" ? sentence : "",
        name: file.name,
        mime: file.type,
        blob: file,
      })
    : undefined;
  if (file && (!file.size || !record?.success))
    throw new Error(t("card_media_invalid"));
  const word = await db.vocabulary.get(wordId);
  if (!word) throw new Error(t("card_media_word_missing"));
  if (!noteId) await ensureReaderCard(word);
  const document = await mediaDocument(wordId, noteId);
  if (!document) throw new Error(t("card_not_found"));
  const index = document.noteType.bindings[bindingFor(kind)];
  if (index === undefined) throw new Error(t("card_media_binding_missing"));
  const previous =
    kind === "audio"
      ? await getCardMedia(wordId, kind, sentence, noteId)
      : undefined;
  await srsWrite(() =>
    db.transaction("rw", [db.notes, db.cardAssets], async () => {
      const current = await db.notes.get(document.note.id);
      if (!current) throw new Error(t("card_not_found"));
      const fields = [...current.fields];
      const sentenceIndex = document.noteType.bindings.sentence;
      const primary =
        kind !== "audio" ||
        sentenceIndex === undefined ||
        !fields[sentenceIndex] ||
        fieldText(fields[sentenceIndex]) === sentence;
      if (!primary && document.noteType.fields[9]?.name !== "Examples")
        throw new Error(t("card_media_binding_missing"));
      const name =
        kind === "audio"
          ? sentenceAudioName(sentence)
          : `_srs_upload_${crypto.randomUUID()}_${file?.name.replace(/[[\]"<>/\\]/g, "_") || ""}`;
      if (primary) fields[index] = "";
      if (record?.success) {
        await db.cardAssets.put({
          id: assetId(document.note.mediaNamespace, name),
          namespace: document.note.mediaNamespace,
          name,
          mime: file!.type,
          blob: file!,
        });
        const value =
          kind === "background"
            ? file!.type.startsWith("video/")
              ? `<video src="${escapeHtml(name)}" autoplay loop muted playsinline></video>`
              : `<img src="${escapeHtml(name)}" alt="">`
            : `[sound:${name}]`;
        if (primary) fields[index] = value;
        else if (
          document.noteType.fields[9]?.name === "Examples" &&
          !fields[9]!.includes(value)
        ) {
          if (previous && fields[9]!.includes(`[sound:${previous.name}]`))
            fields[9] = fields[9]!.replaceAll(
              `[sound:${previous.name}]`,
              value,
            );
          else fields[9] += `<p>${escapeHtml(sentence)} ${value}</p>`;
        }
      } else if (kind === "audio") {
        await db.cardAssets.delete(assetId(document.note.mediaNamespace, name));
        if (document.noteType.fields[9]?.name === "Examples")
          fields[9] = fields[9]!
            .replaceAll(`[sound:${name}]`, "")
            .replaceAll(`[sound:${previous?.name || name}]`, "");
      }
      await db.notes.update(document.note.id, {
        fields,
        version: current.version + 1,
        updated: Date.now(),
      });
    }),
  );
}
