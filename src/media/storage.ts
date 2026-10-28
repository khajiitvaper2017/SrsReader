import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { t } from "@/shared/i18n/i18n";
import { cardMediaId, cardMediaSchema, type CardMedia } from "@/media/model";

// Files stay in IndexedDB: browser runtime messages do not preserve Blob values.
export async function saveCardMedia(
  wordId: string,
  kind: CardMedia["kind"],
  sentence: string,
  file: File | null,
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
  await srsWrite(() =>
    db.transaction("rw", [db.vocabulary, db.cardMedia], async () => {
      if (!(await db.vocabulary.get(wordId)))
        throw new Error(t("card_media_word_missing"));
      if (record?.success) await db.cardMedia.put(record.data);
      else await db.cardMedia.delete(id);
    }),
  );
}
