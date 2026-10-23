import { useChanges } from "@/shared/hooks/useChanges";
import { srsClient } from "@/srs/client";
import type { ReviewStatistics } from "@/srs/statistics";
import { useCallback, useEffect, useRef, useState } from "react";

export function useReviewStatistics(language: string) {
  const [year, setYear] = useState<number>();
  const revision = useRef(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReviewStatistics>();
  const [error, setError] = useState("");
  useEffect(() => setData(undefined), [language]);
  const load = useCallback(() => {
    const current = ++revision.current;
    setLoading(true);
    void srsClient({ action: "reviewStats", language, year })
      .then((value) => {
        if (current !== revision.current) return;
        setData(value);
        setError("");
      })
      .catch((error) => {
        if (current === revision.current) setError(error.message);
      })
      .finally(() => {
        if (current === revision.current) setLoading(false);
      });
  }, [year, language]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => {
      clearInterval(timer);
      revision.current++;
    };
  }, [load]);
  useChanges(load, ["vocabulary", "srs", "settings"]);
  return { data, error, loading, setYear };
}
