import { dictionariesClient } from "@/dictionaries/client";
import type { Request, Responses } from "@/dictionaries/contracts";
import type { Dictionary } from "@/dictionaries/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { useCallback, useEffect, useState } from "react";

type SearchRequest = Extract<Request, { action: "searchDictionaries" }>;

export function useDictionarySearch() {
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const [ready, setReady] = useState(false);
  const [request, setRequest] = useState<SearchRequest>();
  const [result, setResult] = useState<Responses["searchDictionaries"]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useChanges(reload, ["dictionaries"]);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setRequest(undefined);
    setResult(undefined);
    setError("");
    void dictionariesClient({ action: "dictionaries" })
      .then((rows) => {
        if (alive)
          setDictionaries(rows.filter((d) => d.enabled && d.count > 0));
      })
      .catch((error) => {
        if (alive) setError(error.message);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [version]);
  useEffect(() => {
    if (!request) {
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    setError("");
    void dictionariesClient(request)
      .then((page) => {
        if (alive)
          setResult((previous) => ({
            entries: request.offset
              ? [...(previous?.entries || []), ...page.entries]
              : page.entries,
            hasMore: page.hasMore,
          }));
      })
      .catch((error) => {
        if (alive) setError(error.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [request]);
  return {
    dictionaries,
    ready,
    result,
    busy,
    error,
    search: (criteria: Omit<SearchRequest, "action" | "offset">) => {
      setResult(undefined);
      setRequest({ ...criteria, action: "searchDictionaries", offset: 0 });
    },
    clear: () => {
      setRequest(undefined);
      setResult(undefined);
      setError("");
    },
    more: () => {
      if (request && result?.hasMore)
        setRequest({ ...request, offset: result.entries.length });
    },
  };
}
