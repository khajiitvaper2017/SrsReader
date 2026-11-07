import { lookupClient } from "@/lookup/client";
import type { LookupPage } from "@/lookup/model";
import { readerKeysSchema, readerSessionSchema } from "@/reader/controls";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";

export function useLookupNavigation() {
  const [session, setSession] = useState(() =>
    new URLSearchParams(location.search).get("session"),
  );
  const [pages, setPages] = useState<LookupPage[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const parsed = readerSessionSchema.safeParse(event.data);
      if (!parsed.success || parsed.data.session === session) return;
      const url = new URL(location.href);
      if (parsed.data.session)
        url.searchParams.set("session", parsed.data.session);
      else url.searchParams.delete("session");
      history.replaceState(null, "", url);
      setPages([]);
      setError("");
      setSession(parsed.data.session);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [session]);
  useEffect(() => {
    if (!session) {
      setError(t("use_your_lookup_control_on_a_word_on"));
      return;
    }
    let active = true;
    void lookupClient({ action: "session", id: session })
      .then((page) => {
        if (active) setPages([page]);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [session]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const parsed = readerKeysSchema.safeParse(event.data);
      if (
        !parsed.success ||
        parsed.data.session !== session ||
        !parsed.data.pressed ||
        parsed.data.code !== "Escape"
      )
        return;
      if (pages.length > 1) setPages((pages) => pages.slice(0, -1));
      else void lookupClient({ action: "closeLookup" });
    };
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "srs-reader-ready", session }, "*");
    return () => window.removeEventListener("message", listener);
  }, [pages.length, session]);
  return { pages, setPages, error, session };
}
