import { AudioButton } from "@/audio/AudioButton";
import { Meanings } from "@/dictionaries/Meanings";
import { shortDefinition } from "@/dictionaries/definitions";
import type { Settings } from "@/settings/model";
import { wordStateLabels, wordStates } from "@/settings/word-styles";
import { i18n, number, t } from "@/shared/i18n/i18n";
import { rpc } from "@/shared/rpc";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Select, SelectOption } from "@/shared/ui/Select";
import { useChanges } from "@/shared/useChanges";
import { SentenceTranslation } from "@/translation/SentenceTranslation";
import { Sentence } from "@/vocabulary/Sentence";
import { WordExamples } from "@/vocabulary/examples/WordExamples";
import { stateOf, type Vocabulary } from "@/vocabulary/model";
import {
  Check,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function WordsPage({ settings }: { settings: Settings }) {
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [definition, setDefinition] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    detailRef.current?.scrollTo(0, 0);
    detailRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const load = useCallback(() => {
    void rpc({ action: "words", query })
      .then(setWords)
      .catch((error) => setError(error.message));
  }, [query]);
  useEffect(load, [load]);
  useChanges(load);
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
  return (
    <>
      <ErrorBox error={error} />
      <div className="word-toolbar">
        <input
          type="search"
          aria-label={t("search_saved_words")}
          placeholder={t("search_words")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          aria-label={t("filter_words")}
          value={filter}
          onValueChange={(value) => setFilter(value)}
        >
          <SelectOption value="all">{t("all_words")}</SelectOption>
          <SelectOption value="leeches">{t("srs_leeches")}</SelectOption>
          {wordStates
            .filter((state) => state !== "unknown")
            .map((state) => (
              <SelectOption key={state} value={state}>
                {t(wordStateLabels[state])}
              </SelectOption>
            ))}
        </Select>
      </div>
      {!visible.length ? (
        <section className="panel">
          <Empty title={t("no_words_found")}>
            <p>
              {query || filter !== "all"
                ? ""
                : t("save_a_word_from_a_website_to_add")}
            </p>
          </Empty>
        </section>
      ) : (
        <div className={`words-layout ${word ? "has-detail" : ""}`}>
          <section className="word-list panel">
            {visible.map((w) => (
              <button
                className={`word-row ${selected === w.id ? "selected" : ""}`}
                key={w.id}
                onClick={() => {
                  setSelected(w.id);
                  setEditing(false);
                }}
              >
                <div>
                  <strong lang={w.language}>{w.lemma}</strong>
                  <span>
                    {shortDefinition(w).slice(0, 140) ||
                      t("open_to_see_definitions")}
                  </span>
                </div>
                <span
                  className={`state state-${stateOf(w, settings.matureIntervalDays)}`}
                >
                  {t(wordStateLabels[stateOf(w, settings.matureIntervalDays)])}
                </span>
              </button>
            ))}
          </section>
          {word && (
            <section className="word-detail panel" ref={detailRef}>
              <div className="row between">
                <button
                  className="icon-button"
                  title={t("close_word_details")}
                  aria-label={t("close_word_details")}
                  onClick={() => setSelected("")}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className="word-heading">
                <h2 lang={word.language}>{word.lemma}</h2>
                <AudioButton
                  word={word}
                  settings={settings}
                  onError={setError}
                />
              </div>
              {editing ? (
                <div className="edit-form">
                  <label>
                    {t("definition")}{" "}
                    <textarea
                      rows={7}
                      value={definition}
                      onChange={(event) => setDefinition(event.target.value)}
                    />
                  </label>
                  <p className="muted small-text">
                    {t(
                      "saving_replaces_the_dictionary_snapshot_for_this_card",
                    )}{" "}
                  </p>
                  <div className="row">
                    <button
                      className="primary"
                      disabled={!definition.trim()}
                      onClick={() =>
                        void action(async () => {
                          await rpc({
                            action: "editWord",
                            id: word.id,
                            definition,
                            contexts: word.contexts,
                          });
                          setEditing(false);
                        })
                      }
                    >
                      <Save aria-hidden="true" /> {t("save_definition")}
                    </button>
                    <button
                      className="quiet icon-button"
                      title={t("cancel")}
                      aria-label={t("cancel")}
                      onClick={() => setEditing(false)}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <Meanings
                  meanings={word.meanings}
                  language={word.language}
                  settings={settings}
                />
              )}
              <WordExamples
                key={word.id}
                word={word}
                settings={settings}
                surface={word.contexts[0]?.surface}
              />
              {word.contexts.map((context, i) => (
                <div className="sentence-box" key={`${word.id}:${i}`}>
                  <Sentence context={context} language={word.language} />
                  <SentenceTranslation
                    context={context}
                    language={word.language}
                    settings={settings}
                    wordId={word.id}
                  />
                  <div className="sentence-footer">
                    <span className="truncate">{context.title}</span>
                    <button
                      title={t("edit_sentence")}
                      aria-label={t("edit_sentence")}
                      className="quiet icon-button"
                      onClick={() => {
                        const sentence = prompt(
                          t(
                            "edit_this_sentence_the_encountered_word_must_remain",
                          ),
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
                                translation:
                                  sentence === c.sentence
                                    ? c.translation
                                    : undefined,
                                start,
                                end: start + c.surface.length,
                              }
                            : c,
                        );
                        void action(() =>
                          rpc({ action: "editWord", id: word.id, contexts }),
                        );
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <AudioButton
                      word={word}
                      sentence={context.sentence}
                      settings={settings}
                      onError={setError}
                    />
                  </div>
                </div>
              ))}
              <label className="setting-row">
                <span>
                  <strong>{t("srs_word_retention")}</strong>
                  <small>{t("srs_override_help")}</small>
                </span>
                <input
                  type="number"
                  min={70}
                  max={99}
                  placeholder={t("srs_global")}
                  value={
                    word.retentionOverride === null
                      ? ""
                      : Math.round(word.retentionOverride * 100)
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "" ||
                      (Number(value) >= 70 && Number(value) <= 99)
                    )
                      void action(() =>
                        rpc({
                          action: "retentionOverride",
                          id: word.id,
                          value: value === "" ? null : Number(value) / 100,
                        }),
                      );
                  }}
                />
              </label>
              {word.card && (
                <p className="muted">
                  {t("srs_lapses", { count: word.card.lapses })}
                  {word.leech ? ` · ${t("srs_leech")}` : ""}
                </p>
              )}
              {word.card && !word.known && (
                <div className="schedule-info">
                  <span>{t("next_review")}</span>
                  <strong>
                    {new Date(word.card.due).toLocaleString(
                      i18n.resolvedLanguage,
                    )}
                  </strong>
                  <span>
                    {t("review_history_counts", {
                      reviews: number(word.card.reps),
                      lapses: number(word.card.lapses),
                    })}{" "}
                  </span>
                </div>
              )}
              <div className="detail-actions">
                <button
                  title={t("edit_definition")}
                  aria-label={t("edit_definition")}
                  className="quiet icon-button"
                  onClick={() => {
                    setDefinition(shortDefinition(word));
                    setEditing(true);
                  }}
                >
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  title={t("refresh_from_dictionary")}
                  aria-label={t("refresh_from_dictionary")}
                  className="quiet icon-button"
                  onClick={() =>
                    void action(() =>
                      rpc({ action: "refreshWord", id: word.id }),
                    )
                  }
                >
                  <RefreshCw aria-hidden="true" />
                </button>
                <button
                  className="quiet master-action"
                  aria-pressed={word.known}
                  onClick={() =>
                    void action(() =>
                      rpc({
                        action: "known",
                        id: word.id,
                        term: word.lemma,
                        value: !word.known,
                      }),
                    )
                  }
                >
                  <Check aria-hidden="true" />
                  {word.known ? t("unmaster") : t("master")}
                </button>
                {!word.known && (
                  <button
                    className="quiet"
                    onClick={() =>
                      void action(() =>
                        rpc({
                          action: "suspend",
                          id: word.id,
                          value: !word.suspended,
                        }),
                      )
                    }
                  >
                    {word.suspended ? (
                      <Play aria-hidden="true" />
                    ) : (
                      <Pause aria-hidden="true" />
                    )}{" "}
                    {word.suspended ? t("resume") : t("suspend")}
                  </button>
                )}
                <button
                  title={t("delete_word")}
                  aria-label={t("delete_word")}
                  className="danger quiet icon-button"
                  onClick={() => {
                    if (
                      confirm(
                        t("delete_its_review_history_and_its_recording", {
                          lemma: word.lemma,
                        }),
                      )
                    )
                      void action(async () => {
                        await rpc({ action: "deleteWord", id: word.id });
                        setSelected("");
                      });
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
