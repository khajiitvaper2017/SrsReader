import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import type { Responses } from "@/srs/contracts";
import { createReviewPreload } from "@/srs/preload";
import { clearTranslationCache } from "@/translation/translate";
import { useCallback, useEffect, useMemo } from "react";

export function useReviewPreload(
  settings: Settings,
  queue?: Responses["queue"],
) {
  const preload = useMemo(() => createReviewPreload(settings), [settings]);
  useChanges(
    useCallback(
      (message) => {
        preload.invalidate(message.word?.id);
        if (!document.hidden) preload.start(queue?.words || []);
      },
      [preload, queue],
    ),
    ["vocabulary", "dictionaries", "dictionaryVisibility", "collection"],
  );
  useEffect(() => {
    const start = () => {
      if (document.hidden) preload.stop();
      else preload.start(queue?.words || []);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      preload.stop();
      document.removeEventListener("visibilitychange", start);
    };
  }, [preload, queue]);
  useEffect(() => clearTranslationCache, []);
  return preload;
}
