import { useEffect, useState } from "react";
import { vocabularyClient } from "@/vocabulary/client";
import type { Vocabulary } from "@/vocabulary/model";

export function useDictionaryVisibility(
  wordId: string,
  saved: Vocabulary | undefined,
  onError: (message: string) => void,
) {
  const [hiddenDictionaries, setHidden] = useState<string[]>([]);
  const [expandedDictionaries, setExpanded] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setHidden(saved?.hiddenDictionaries || []);
    setExpanded(saved?.expandedDictionaries || []);
  }, [wordId, saved?.id, saved?.version]);
  async function setView(
    dictionaryId: string,
    view: "hidden" | "matched" | "all",
  ) {
    if (saving) return;
    const hidden = hiddenDictionaries.filter((id) => id !== dictionaryId);
    const expanded = expandedDictionaries.filter((id) => id !== dictionaryId);
    if (view === "hidden") hidden.push(dictionaryId);
    if (view === "all") expanded.push(dictionaryId);
    setHidden(hidden);
    setExpanded(expanded);
    if (!saved) return;
    setSaving(true);
    try {
      await vocabularyClient({
        action: "dictionaryVisibility",
        id: wordId,
        dictionaryId,
        view,
      });
    } catch (error) {
      setHidden(hiddenDictionaries);
      setExpanded(expandedDictionaries);
      onError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return {
    hiddenDictionaries,
    expandedDictionaries,
    setView,
    toggleDictionary: (id: string) =>
      void setView(id, expandedDictionaries.includes(id) ? "matched" : "all"),
    toggleHiddenDictionary: (id: string) =>
      void setView(id, hiddenDictionaries.includes(id) ? "matched" : "hidden"),
  };
}
