import { Box } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { useEffect } from "react";
import { useCardMedia } from "@/media/hooks/useCardMedia";
import { t } from "@/shared/i18n/i18n";
import classes from "./media.module.css";

export function CardBackground({
  wordId,
  onError,
}: {
  wordId: string;
  onError: (error: string) => void;
}) {
  const loaded = useCardMedia(wordId, "background");
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (loaded?.error) onError(loaded.error);
  }, [loaded?.error, onError]);
  if (!loaded?.media) return null;
  return (
    <Box className={classes.background} aria-hidden data-srs-reader>
      {loaded.media.mime.startsWith("video/") ? (
        <video
          key={loaded.url}
          src={loaded.url}
          autoPlay={!reducedMotion}
          loop
          muted
          playsInline
          onError={() => onError(t("card_media_unavailable"))}
        />
      ) : (
        <img
          src={loaded.url}
          alt=""
          onError={() => onError(t("card_media_unavailable"))}
        />
      )}
    </Box>
  );
}
