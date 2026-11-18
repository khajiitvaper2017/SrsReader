import { useChanges } from "@/shared/hooks/useChanges";
import { srsClient } from "@/srs/client";
import type {
  ReviewStatistics,
  StatisticsRange,
  StatisticsScope,
} from "@/srs/statistics";
import { useCallback, useEffect, useRef, useState } from "react";

export function useReviewStatistics(
  scope?: StatisticsScope,
  range?: StatisticsRange,
) {
  const { language, deckId } = scope ?? {};
  const [year, setYear] = useState<number>();
  const revision = useRef(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReviewStatistics>();
  const [error, setError] = useState("");
  const load = useCallback(() => {
    const current = ++revision.current;
    setLoading(true);
    void srsClient({
      action: "reviewStats",
      year,
      scope: language ? { language, deckId } : undefined,
      range,
    })
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
  }, [year, language, deckId, range]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => {
      clearInterval(timer);
      revision.current++;
    };
  }, [load]);
  useChanges(load, ["vocabulary", "srs", "settings", "collection"]);
  return { data, error, loading, setYear };
}
