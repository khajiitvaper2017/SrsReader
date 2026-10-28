import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { db } from "@/platform/database/db";
import { cardMediaId, type CardMedia } from "@/media/model";

export function useCardMedia(
  wordId: string,
  kind: CardMedia["kind"],
  sentence = "",
) {
  const id = cardMediaId(wordId, kind, sentence);
  const [loaded, setLoaded] = useState<{
    id: string;
    media?: CardMedia;
    url: string;
    error: string;
  }>();
  useEffect(() => {
    let url = "";
    const subscription = liveQuery(() => db.cardMedia.get(id)).subscribe({
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
  }, [id]);
  return loaded?.id === id ? loaded : undefined;
}
