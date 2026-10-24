import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { srsClient } from "@/srs/client";
import type { Responses as SrsResponses } from "@/srs/contracts";
import { folded } from "@/languages/text";
import { vocabularyClient } from "@/vocabulary/client";
import type { ReadingContext } from "@/vocabulary/model";
import { stateOf, type Vocabulary } from "@/vocabulary/model";
import { useCallback, useEffect, useRef, useState } from "react";

export function useWords({
  settings,
  language,
  deckId,
}: {
  settings: Settings;
  language: string;
  deckId?: string;
}) {
  const [contexts, setContexts] = useState<ReadingContext[]>([]);
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [overview, setOverview] = useState<SrsResponses["studyOverview"]>([]);
  const [loading, setLoading] = useState(true);
  const pending = useRef(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollTo(0, 0);
    detailRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  useEffect(() => setPage(1), [query, filter]);
  const load = useCallback(() => {
    const request = ++pending.current;
    setLoading(true);
    void Promise.all([
      vocabularyClient({ action: "words", language, deckId }),
      srsClient({ action: "studyOverview" }),
    ])
      .then(([words, overview]) => {
        if (request !== pending.current) return;
        setWords(words);
        setOverview(overview);
        setError("");
      })
      .catch((error) => {
        if (request === pending.current) setError(error.message);
      })
      .finally(() => {
        if (request === pending.current) setLoading(false);
      });
  }, [language, deckId]);
  useEffect(() => {
    load();
    return () => {
      pending.current++;
    };
  }, [load]);
  useChanges(load, [
    "vocabulary",
    "srs",
    "settings",
    "dictionaries",
    "collection",
  ]);
  const search = folded(query.trim(), language);
  const visible = words.filter(
    (w) =>
      folded(`${w.lemma} ${w.reading}`, language).includes(search) &&
      (filter === "all" ||
        (filter === "leeches"
          ? w.leech
          : stateOf(w, settings.matureIntervalDays) === filter)),
  );
  const pages = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pages);
  const pageWords = visible.slice((currentPage - 1) * 50, currentPage * 50);
  const word = visible.find((w) => w.id === selected);
  useEffect(() => {
    let alive = true;
    setContexts([]);
    if (word)
      void srsClient({ action: "sentenceExamples", id: word.id })
        .then((value) => {
          if (alive) setContexts(value);
        })
        .catch((error) => {
          if (alive) setError(error.message);
        });
    return () => {
      alive = false;
    };
  }, [word]);
  async function action(task: () => Promise<unknown>) {
    try {
      setError("");
      await task();
      load();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function changeRetention(value: string | number) {
    if (!word) return;
    if (value === "" || (Number(value) >= 70 && Number(value) <= 99))
      void action(() =>
        vocabularyClient({
          action: "retentionOverride",
          id: word.id,
          value: value === "" ? null : Number(value) / 100,
        }),
      );
  }
  function refreshWord() {
    if (!word) return;
    return void action(() =>
      vocabularyClient({ action: "refreshWord", id: word.id }),
    );
  }
  function toggleMastery() {
    if (!word) return;
    return void action(() =>
      vocabularyClient({
        action: "known",
        id: word.id,
        term: word.lemma,
        value: !word.known,
      }),
    );
  }
  function toggleSuspension() {
    if (!word) return;
    return void action(() =>
      vocabularyClient({
        action: "suspend",
        id: word.id,
        value: !word.suspended,
      }),
    );
  }
  function deleteWord() {
    if (!word) return;
    if (
      confirm(
        t("delete_word_and_recording_confirm", {
          lemma: word.lemma,
        }),
      )
    )
      void action(async () => {
        await vocabularyClient({
          action: "deleteWord",
          id: word.id,
        });
        setSelected("");
      });
  }
  return {
    query,
    setQuery,
    filter,
    setFilter,
    selected,
    setSelected,
    error,
    setError,
    detailRef,
    word,
    visible,
    overview,
    loading,
    pageWords,
    page: currentPage,
    pages,
    setPage,
    action,
    contexts,
    changeRetention,
    refreshWord,
    toggleMastery,
    toggleSuspension,
    deleteWord,
  };
}
