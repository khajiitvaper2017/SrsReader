import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { cardMediaId, type CardMedia } from "@/media/model";
import { getCardMedia } from "@/media/storage";

export function useCardMedia(
  wordId: string,
  kind: CardMedia["kind"],
  sentence = "",
  noteId?: string,
) {
  const id = JSON.stringify([noteId, cardMediaId(wordId, kind, sentence)]);
  const [loaded, setLoaded] = useState<{
    id: string;
    media?: CardMedia;
    url: string;
    error: string;
  }>();
  useEffect(() => {
    let url = "";
    const subscription = liveQuery(() =>
      getCardMedia(wordId, kind, sentence, noteId),
    ).subscribe({
      next: (media) => {
        if (url) URL.revokeObjectURL(url);
        url = media ? URL.createObjectURL(media.blob) : "";
        setLoaded({ id, media, url, error: "" });
      },
      error: (error: Error) => setLoaded({ id, url: "", error: error.message }),
    });
    return () => {
      subscription.unsubscribe();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, wordId, kind, sentence, noteId]);
  return loaded?.id === id ? loaded : undefined;
}
