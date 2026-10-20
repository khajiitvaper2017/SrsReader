import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { vocabularyClient } from "@/vocabulary/client";
import type { ReadingContext } from "@/vocabulary/model";
import { stateOf, type Vocabulary } from "@/vocabulary/model";
import { useCallback, useEffect, useRef, useState } from "react";

export function useWords({ settings }: { settings: Settings }) {
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [definition, setDefinition] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollTo(0, 0);
    detailRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const load = useCallback(() => {
    void vocabularyClient({ action: "words", query })
      .then(setWords)
      .catch((error) => setError(error.message));
  }, [query]);
  useEffect(load, [load]);
  useChanges(load, ["vocabulary", "settings", "dictionaries"]);
  const word = words.find((w) => w.id === selected);
  const visible = words.filter(
    (w) =>
      filter === "all" ||
      (filter === "leeches"
        ? w.leech
        : stateOf(w, settings.matureIntervalDays) === filter),
  );
  async function action(task: () => Promise<unknown>) {
    try {
      setError("");
      await task();
      load();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function saveDefinition() {
    if (!word) return;
    return void action(async () => {
      await vocabularyClient({
        action: "editWord",
        id: word.id,
        definition,
        contexts: word.contexts,
      });
      setEditing(false);
    });
  }
  function editSentence(context: ReadingContext, i: number) {
    if (!word) return;
    const sentence = prompt(
      t("edit_this_sentence_the_encountered_word_must_remain"),
      context.sentence,
    );
    if (sentence === null) return;
    const start = sentence.indexOf(context.surface);
    if (start < 0) {
      setError(
        t("keep_in_the_sentence", {
          surface: context.surface,
        }),
      );
      return;
    }
    const contexts = word.contexts.map((c, j) =>
      j === i
        ? {
            ...c,
            sentence,
            translation: sentence === c.sentence ? c.translation : undefined,
            start,
            end: start + c.surface.length,
          }
        : c,
    );
    void action(() =>
      vocabularyClient({
        action: "editWord",
        id: word.id,
        contexts,
      }),
    );
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
        t("delete_its_review_history_and_its_recording", {
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
    editing,
    setEditing,
    definition,
    setDefinition,
    detailRef,
    word,
    visible,
    action,
    saveDefinition,
    editSentence,
    changeRetention,
    refreshWord,
    toggleMastery,
    toggleSuspension,
    deleteWord,
  };
}
