import { useCallback, useEffect, useRef, useState } from "react";
import { useChanges } from "@/shared/hooks/useChanges";
import { srsClient } from "@/srs/client";
import type { Responses } from "@/srs/contracts";

export function useStudyOverview(enabled: boolean) {
  const [overview, setOverview] = useState<Responses["studyOverview"]>();
  const [error, setError] = useState("");
  const revision = useRef(0);
  const load = useCallback(() => {
    if (!enabled) return;
    const request = ++revision.current;
    void srsClient({ action: "studyOverview" })
      .then((value) => {
        if (request !== revision.current) return;
        setOverview(value);
        setError("");
      })
      .catch((failure: Error) => {
        if (request === revision.current) setError(failure.message);
      });
  }, [enabled]);
  useChanges(load, [
    "vocabulary",
    "srs",
    "settings",
    "dictionaries",
    "collection",
  ]);
  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = setInterval(load, 60000);
    return () => {
      revision.current++;
      clearInterval(timer);
    };
  }, [enabled, load]);
  return { overview, error };
}
