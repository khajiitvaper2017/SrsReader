import { lookupClient } from "@/lookup/client";
import type { LookupPage } from "@/lookup/model";
import { readerKeysSchema } from "@/reader/controls";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";

export function useLookupNavigation() {
  const [pages, setPages] = useState<LookupPage[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const session = new URLSearchParams(location.search).get("session");
    if (!session) {
      setError(t("use_your_lookup_control_on_a_word_on"));
      return;
    }
    void lookupClient({ action: "session", id: session })
      .then((page) => setPages([page]))
      .catch((error) => setError(error.message));
  }, []);
  useEffect(() => {
    const session = new URLSearchParams(location.search).get("session");
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
  }, [pages.length]);
  return { pages, setPages, error };
}
