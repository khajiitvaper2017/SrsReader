import { dictionaryImage } from "@/dictionaries/storage";
import { useEffect, useState } from "react";

export function useDictionaryImage({
  path,
  dictionaryId,
}: {
  path: string;
  dictionaryId: string;
  alt?: string;
  width?: number;
  height?: number;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    let disposed = false;
    if (/^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);base64,/.test(path)) {
      setUrl(path);
      return;
    }
    void dictionaryImage(dictionaryId, path).then((media) => {
      if (media && !disposed) {
        objectUrl = URL.createObjectURL(media.blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, dictionaryId]);
  return { url };
}
