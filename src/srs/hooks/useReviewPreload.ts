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
      (message) =>
        preload.invalidate(
          message.scope === "dictionaryVisibility"
            ? message.word?.id
            : undefined,
        ),
      [preload],
    ),
    ["vocabulary", "dictionaries", "frequency", "dictionaryVisibility"],
  );
  useEffect(() => {
    preload.start(queue?.words || []);
    return preload.stop;
  }, [preload, queue]);
  useEffect(() => clearTranslationCache, []);
  return preload;
}
