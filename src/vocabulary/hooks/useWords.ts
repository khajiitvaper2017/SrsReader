import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { srsClient } from "@/srs/client";
import { db } from "@/platform/database/db";
import type { Deck } from "@/srs/deck-model";
import { useDebouncedValue } from "@mantine/hooks";
import type { Request } from "@/vocabulary/contracts";
import { vocabularyClient } from "@/vocabulary/client";
import type { SentenceExample } from "@/examples/model";
import { type Vocabulary } from "@/vocabulary/model";
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
  const [contexts, setContexts] = useState<SentenceExample[]>([]);
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const overview = settings.studyLanguages.map((language) => ({
    language,
    decks: decks.filter((deck) => deck.language === language),
  }));
  const [loading, setLoading] = useState(true);
  const pending = useRef(0);
  const [query, updateQuery] = useState("");
  const [filter, updateFilter] =
    useState<Extract<Request, { action: "words" }>["filter"]>("all");
  const [total, setTotal] = useState(0);
  const [search] = useDebouncedValue(query, 150);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollTo(0, 0);
    detailRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  function setQuery(value: string) {
    updateQuery(value);
    setPage(1);
  }
  function setFilter(value: string) {
    updateFilter(value as typeof filter);
    setPage(1);
  }
  const loadDecks = useCallback(() => {
    void db.decks
      .toArray()
      .then(setDecks)
      .catch((error) => setError(error.message));
  }, []);
  useEffect(loadDecks, [loadDecks]);
  useChanges(loadDecks, ["collection"]);
  const load = useCallback(() => {
    const request = ++pending.current;
    setLoading(true);
    void vocabularyClient({
      action: "words",
      language,
      deckId,
      query: search,
      filter,
      page,
    })
      .then((result) => {
        if (request !== pending.current) return;
        setWords(result.words);
        setTotal(result.total);
        setPage(result.page);
        setError("");
      })
      .catch((error) => {
        if (request === pending.current) setError(error.message);
      })
      .finally(() => {
        if (request === pending.current) setLoading(false);
      });
  }, [language, deckId, search, filter, page]);
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
  const pages = Math.max(1, Math.ceil(total / 50));
  const [savedWord, setWord] = useState<Vocabulary>();
  const word =
    words.find((entry) => entry.id === selected) ||
    (savedWord?.id === selected ? savedWord : undefined);
  useEffect(() => {
    let alive = true;
    if (!selected) {
      setWord(undefined);
      return;
    }
    void vocabularyClient({ action: "word", id: selected })
      .then((value) => {
        if (alive) setWord(value);
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [selected, words]);
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
  }, [word?.id, word?.version]);
  async function action(task: () => Promise<unknown>) {
    try {
      setError("");
      await task();
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
    total,
    overview,
    loading,
    pageWords: words,
    page,
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
