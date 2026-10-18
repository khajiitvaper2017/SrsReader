import {
  t,
  i18n,
  number,
  downloadSize,
  interfaceLanguages,
} from "../../src/i18n";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { rpc } from "../../src/api";
import { db } from "../../src/db";
import { stopAudio, localVoices, playBlob, speak } from "../../src/audio";
import { checkUpdate } from "../../src/dictionaries";
import {
  exportLearning,
  exportSettings,
  readLearning,
  readSettings,
  restoreLearning,
  restoreSettings,
  saveBlob,
} from "../../src/exports";
import ImportWorker from "../../src/import.worker?worker";
import {
  stateOf,
  type Dictionary,
  type Settings,
  type Vocabulary,
} from "../../src/model";
import {
  AudioButton,
  Empty,
  ErrorBox,
  Icon,
  Logo,
  Meanings,
  Ratings,
  Sentence,
  intervalLabel,
  shortDefinition,
  useChanges,
  useSettings,
} from "../../src/ui";
import type { ImportProgress } from "../../src/dictionaries";
import { readDownload } from "../../src/download";
import "../../src/styles.css";
import {
  languageIso3,
  morphologyLanguage,
  languageName,
  systemLanguage,
} from "../../src/languages";
import { LookupControls } from "../../src/LookupControls";
import { WordColors } from "../../src/WordColors";
import { SentenceTranslation } from "../../src/SentenceTranslation";
import { LanguageSelect } from "../../src/LanguageSelect";
import LanguageDataWorker from "../../src/language-data.worker?worker";
import { wordStates, wordStateLabels } from "../../src/word-styles";
import {
  FrequencyBrowser,
  frequencyDownloadUrl,
} from "../../src/FrequencyBrowser";
import {
  WiktionaryBrowser,
  wiktionaryDownloadUrl,
  wiktionaryName,
} from "../../src/WiktionaryBrowser";

function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "review");
  const [settings, setSettings, ready] = useSettings();
  const [stats, setStats] = useState({ total: 0, due: 0, known: 0, today: 0 });
  const loadStats = useCallback(() => {
    void rpc({ action: "stats" }).then(setStats).catch(console.error);
  }, []);
  useEffect(loadStats, [loadStats]);
  useChanges(loadStats);
  useEffect(() => {
    const hash = () => {
      setPage(location.hash.slice(1) || "review");
      stopAudio();
    };
    addEventListener("hashchange", hash);
    return () => removeEventListener("hashchange", hash);
  }, []);
  const setup = page === "setup" || !settings.setupComplete;
  if (!ready) return null;
  return (
    <div className="app-shell">
      <main className="app-main">
        <header className="app-header">
          <a href="#review" className="brand-link">
            <Logo small />
          </a>
          {!setup && (
            <nav aria-label={t("pages")}>
              {[
                ["review", t("review")],
                ["words", t("words")],
                ["settings", t("settings")],
              ].map(([id, label]) => (
                <a
                  className={page === id ? "active" : ""}
                  href={`#${id}`}
                  key={id}
                >
                  {label}
                  {id === "review" && stats.due > 0 && (
                    <span className="nav-count">{stats.due}</span>
                  )}
                </a>
              ))}
            </nav>
          )}
        </header>
        <div className="page-content">
          {setup ? (
            <SettingsPage settings={settings} setSettings={setSettings} setup />
          ) : page === "settings" ? (
            <SettingsPage settings={settings} setSettings={setSettings} />
          ) : page === "words" ? (
            <WordsPage settings={settings} />
          ) : (
            <ReviewPage settings={settings} stats={stats} />
          )}
        </div>
      </main>
    </div>
  );
}

function ReviewPage({
  settings,
  stats,
}: {
  settings: Settings;
  stats: { total: number; due: number; known: number; today: number };
}) {
  const [queue, setQueue] =
    useState<Awaited<ReturnType<typeof rpc<{ action: "queue" }>>>>();
  const [revealed, setRevealed] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [last, setLast] = useState(sessionStorage.getItem("last-review") || "");
  const [front, setFront] = useState(settings.front);
  const [example, setExample] = useState(0);
  const word = queue?.words[0];
  const context = word?.contexts[example];
  const load = useCallback(() => {
    if (busyRef.current) return;
    void rpc({ action: "queue" })
      .then((value) => setQueue(value))
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
  useChanges(load);
  useEffect(() => {
    setFront(settings.front);
  }, [settings.front]);
  useEffect(() => {
    setRevealed(false);
    setExample(0);
    stopAudio();
    if (word)
      void rpc({ action: "preview", id: word.id })
        .then(setTimes)
        .catch((error) => setError(error.message));
  }, [word?.id, word?.card?.reps]);
  useEffect(() => {
    if (!queue?.waiting) return;
    const timer = setTimeout(
      load,
      Math.min(Math.max(500, queue.waiting - Date.now() + 50), 60000),
    );
    return () => clearTimeout(timer);
  }, [queue, load]);
  async function gradeWord(rating: number) {
    if (!word || !revealed || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    stopAudio();
    try {
      const result = await rpc({
        action: "grade",
        id: word.id,
        term: word.lemma,
        rating,
        version: word.version,
        source: "review",
      });
      setLast(result.reviewId);
      sessionStorage.setItem("last-review", result.reviewId);
      setQueue(await rpc({ action: "queue" }));
      setRevealed(false);
    } catch (error) {
      setError((error as Error).message);
      setQueue(await rpc({ action: "queue" }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function reveal() {
    setRevealed(true);
    if (settings.autoplay && word)
      void (async () => {
        const recording = await db.audio.get(word.id);
        if (recording) await playBlob(recording.blob);
        else await speak(word.lemma, word.language, settings.voice);
      })().catch((error) => setError(error.message));
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
          (event.target as HTMLElement).tagName,
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.code === "Space" && word && !revealed) {
        event.preventDefault();
        reveal();
      }
      if (
        revealed &&
        /^[1-4]$/.test(event.key) &&
        (!settings.onlyAgainGood || event.key === "1" || event.key === "3")
      ) {
        event.preventDefault();
        void gradeWord(Number(event.key));
      }
    }
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  async function undo() {
    try {
      await rpc({ action: "undo", id: last });
      setLast("");
      sessionStorage.removeItem("last-review");
      load();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <>
      <div className="review-stats">
        <span>
          {t("due")} <strong>{queue?.due ?? "—"}</strong>
        </span>
        <span>
          {t("new")} <strong>{queue?.fresh ?? "—"}</strong>
        </span>
        <span>
          {t("reviewed_today")} <strong>{stats.today}</strong>
        </span>
      </div>
      <ErrorBox error={error} />
      <div className="review-layout">
        <section className="review-panel">
          <div className="review-panel-top">
            <div className="segmented">
              <button
                className={front === "word" ? "selected" : ""}
                onClick={() => setFront("word")}
              >
                {t("word")}{" "}
              </button>
              <button
                className={front === "sentence" ? "selected" : ""}
                onClick={() => setFront("sentence")}
              >
                {t("in_context")}{" "}
              </button>
            </div>
          </div>
          {word ? (
            <>
              <div className={`review-front ${revealed ? "revealed" : ""}`}>
                {front === "sentence" && context ? (
                  <div className="review-sentence">
                    <Sentence context={context} language={word.language} />
                  </div>
                ) : (
                  <h2 lang={word.language}>{word.lemma}</h2>
                )}
                {word.reading && <span className="muted">{word.reading}</span>}
              </div>
              {revealed ? (
                <div className="review-answer">
                  <div className="row between">
                    <AudioButton
                      word={word}
                      settings={settings}
                      onError={setError}
                    />
                  </div>
                  <Meanings
                    meanings={word.meanings}
                    language={word.language}
                    settings={settings}
                  />
                  {context && (
                    <div className="sentence-box">
                      <Sentence context={context} language={word.language} />
                      {settings.showSentenceTranslation && (
                        <SentenceTranslation
                          key={`${word.id}:${example}`}
                          context={context}
                          language={word.language}
                          settings={settings}
                          wordId={word.id}
                        />
                      )}
                      <div className="sentence-footer">
                        {context.url.startsWith("http") ? (
                          <a
                            href={context.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate"
                          >
                            {context.title || new URL(context.url).hostname}
                          </a>
                        ) : (
                          <span>{context.title}</span>
                        )}
                        <AudioButton
                          word={word}
                          sentence={context.sentence}
                          settings={settings}
                          onError={setError}
                        />
                      </div>
                      {word.contexts.length > 1 && (
                        <button
                          className="link"
                          onClick={() =>
                            setExample((example + 1) % word.contexts.length)
                          }
                        >
                          {t("example_position", {
                            current: example + 1,
                            total: word.contexts.length,
                          })}
                        </button>
                      )}
                    </div>
                  )}
                  <Ratings
                    times={times}
                    disabled={busy}
                    onlyAgainGood={settings.onlyAgainGood}
                    onGrade={(rating) => void gradeWord(rating)}
                  />
                </div>
              ) : (
                <div className="reveal-area">
                  <button className="primary reveal" onClick={reveal}>
                    {t("show_answer")}{" "}
                    <span className="keycap">{t("space")}</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <Empty
              title={
                queue?.waiting
                  ? t("no_reviews_due")
                  : stats.total
                    ? t("no_reviews_due")
                    : t("no_saved_words")
              }
            >
              <p>
                {queue?.waiting
                  ? t("next_review_in", {
                      value1: intervalLabel(queue.waiting),
                    })
                  : stats.total
                    ? ""
                    : t("use_your_lookup_control_on_a_word_to")}
              </p>
              {!stats.total && (
                <a className="button primary" href="#settings">
                  {t("import_dictionary")}{" "}
                </a>
              )}
            </Empty>
          )}
          <footer className="review-bottom">
            <button
              className="quiet"
              disabled={!last || busy}
              onClick={() => void undo()}
            >
              {t("undo_last_review")}{" "}
            </button>
            {word && (
              <button
                className="quiet master-action"
                disabled={busy}
                onClick={() =>
                  void rpc({
                    action: "known",
                    id: word.id,
                    term: word.lemma,
                    value: true,
                  })
                    .then(load)
                    .catch((error) => setError(error.message))
                }
              >
                <Icon name="check" /> {t("master")}{" "}
              </button>
            )}
            {word && (
              <button
                className="quiet"
                disabled={busy}
                onClick={() =>
                  void rpc({ action: "suspend", id: word.id, value: true })
                    .then(load)
                    .catch((error) => setError(error.message))
                }
              >
                {t("suspend_word")}{" "}
              </button>
            )}
          </footer>
        </section>
      </div>
    </>
  );
}

function WordsPage({ settings }: { settings: Settings }) {
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [definition, setDefinition] = useState("");
  const load = useCallback(() => {
    void rpc({ action: "words", query })
      .then(setWords)
      .catch((error) => setError(error.message));
  }, [query]);
  useEffect(load, [load]);
  useChanges(load);
  const word = words.find((w) => w.id === selected);
  const visible = words.filter(
    (w) => filter === "all" || stateOf(w) === filter,
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
        <select
          aria-label={t("filter_words")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          {[
            ["all", t("all_words")],
            ...wordStates
              .filter((state) => state !== "unknown")
              .map((state) => [state, t(wordStateLabels[state])]),
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
                <span className={`state state-${stateOf(w)}`}>
                  {t(wordStateLabels[stateOf(w)])}
                </span>
              </button>
            ))}
          </section>
          {word && (
            <section className="word-detail panel">
              <div className="row between">
                <button
                  className="icon-button"
                  aria-label={t("close_word_details")}
                  onClick={() => setSelected("")}
                >
                  <Icon name="close" />
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
                      {t("save_definition")}{" "}
                    </button>
                    <button className="quiet" onClick={() => setEditing(false)}>
                      {t("cancel")}{" "}
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
                      className="link"
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
                      {t("edit_sentence")}{" "}
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
                  className="quiet"
                  onClick={() => {
                    setDefinition(shortDefinition(word));
                    setEditing(true);
                  }}
                >
                  {t("edit_definition")}{" "}
                </button>
                <button
                  className="quiet"
                  onClick={() =>
                    void action(() =>
                      rpc({ action: "refreshWord", id: word.id }),
                    )
                  }
                >
                  {t("refresh_from_dictionary")}{" "}
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
                  <Icon name="check" />
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
                    {word.suspended ? t("resume") : t("suspend")}
                  </button>
                )}
                <button
                  className="danger quiet"
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
                  {t("delete_word")}{" "}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function TaskProgress({ progress }: { progress: ImportProgress }) {
  const { phase, done, total, unit } = progress;
  const percent = total ? Math.min(100, (done / total) * 100) : undefined;
  const detail =
    unit === "bytes"
      ? `${downloadSize(done)}${total ? ` / ${downloadSize(total)}` : ""}`
      : total
        ? `${number(Math.floor(done))} / ${number(total)}`
        : done
          ? number(done)
          : "";
  return (
    <div className="task-progress">
      <div className="task-progress-label">
        <span>{phase}</span>
        <span>
          {detail}
          {percent !== undefined &&
            ` · ${number(percent / 100, { style: "percent", maximumFractionDigits: 0 })}`}
        </span>
      </div>
      <div
        className={`task-progress-track ${percent === undefined ? "indeterminate" : ""}`}
        role="progressbar"
        aria-label={phase}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={detail || undefined}
      >
        <span
          style={percent === undefined ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function SettingsPage({
  settings,
  setSettings,
  setup = false,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  setup?: boolean;
}) {
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>();
  const [progressTarget, setProgressTarget] = useState<
    "dictionary" | "examples" | "morphology"
  >("dictionary");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [updates, setUpdates] = useState<
    Record<string, { revision: string; url: string } | null>
  >({});
  const worker = useRef<Worker | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const [morphology, setMorphology] = useState({ count: 0 });
  const [exampleCorpus, setExampleCorpus] = useState({
    count: 0,
    installed: false,
  });
  useEffect(() => {
    let alive = true;
    void db.morphology.get(settings.studyLanguage).then((value) => {
      if (alive) setMorphology({ count: value?.count ?? 0 });
    });
    void rpc({ action: "exampleCorpus" })
      .then((value) => {
        if (alive) setExampleCorpus(value);
      })
      .catch((error) => setError(error.message));
    return () => {
      alive = false;
    };
  }, [settings.studyLanguage, busy]);
  const load = useCallback(() => {
    void rpc({ action: "dictionaries" })
      .then(setDictionaries)
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
  useChanges(load);
  useEffect(() => {
    void localVoices().then(setVoices);
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    if (!busy) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", prevent);
    return () => removeEventListener("beforeunload", prevent);
  }, [busy]);
  async function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      setSettings(await rpc({ action: "setSettings", value: next }));
      setError("");
    } catch (error) {
      setSettings(settings);
      setError((error as Error).message);
    }
  }
  async function task(operation: () => Promise<void>) {
    setBusy(true);
    setProgress(undefined);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }
  async function importZip(
    blob: Blob,
    expectedId?: string,
    language: string = settings.studyLanguage,
  ) {
    setProgressTarget("dictionary");
    setProgress({ phase: t("importing"), done: 0, total: 0 });
    await new Promise<void>((resolve, reject) => {
      const current = new ImportWorker();
      worker.current = current;
      current.onmessage = (event) => {
        if (event.data.progress) setProgress(event.data.progress);
        if (event.data.error || event.data.dictionary) {
          current.terminate();
          worker.current = undefined;
          if (event.data.error) reject(new Error(event.data.error));
          else resolve();
        }
      };
      current.onerror = (event) => {
        current.terminate();
        worker.current = undefined;
        reject(new Error(event.message || t("dictionary_import_failed")));
      };
      current.postMessage({
        blob,
        language,
        expectedId,
        locale: i18n.language,
      });
    });
    await rpc({ action: "invalidate" });
    load();
    setNotice(t("dictionary_imported"));
  }
  async function downloadDictionary(
    url: string,
    language: string,
    title: string,
  ) {
    await task(async () => {
      setProgressTarget("dictionary");
      setProgress({
        phase: t("downloading_dictionary", { title }),
        done: 0,
        total: 0,
      });
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok)
        throw new Error(
          t("dictionary_download_failed", { status: response.status }),
        );
      const blob = await readDownload(
        response,
        t("downloading_dictionary", { title }),
        setProgress,
      );
      await importZip(blob, undefined, language);
    });
  }
  async function installLanguageData(
    type: "examples" | "morphology",
    blob?: Blob,
  ) {
    setProgressTarget(type);
    setProgress(undefined);
    if (!settings.studyLanguage)
      throw new Error(t("choose_a_study_language_first"));
    await new Promise<void>((resolve, reject) => {
      const current = new LanguageDataWorker();
      worker.current = current;
      current.onmessage = (event) => {
        if (event.data.progress) setProgress(event.data.progress);
        if (event.data.error || event.data.count !== undefined) {
          current.terminate();
          worker.current = undefined;
          if (event.data.error) reject(new Error(event.data.error));
          else resolve();
        }
      };
      current.onerror = (event) => {
        current.terminate();
        worker.current = undefined;
        reject(new Error(event.message || t("language_data_import_failed")));
      };
      current.postMessage({
        type,
        language: settings.studyLanguage,
        blob,
        locale: i18n.language,
      });
    });
    await rpc({ action: "invalidate" });
    setNotice(
      type === "examples"
        ? t("example_sentences_saved")
        : t("word_forms_saved"),
    );
  }
  async function fileImport(
    file: File | undefined,
    category: "dictionary" | "settings" | "learning",
  ) {
    if (!file || busy) return;
    await task(async () => {
      if (category === "dictionary") await importZip(file);
      else if (category === "settings") {
        const value = await readSettings(file);
        if (
          !confirm(t("replace_your_settings_with_this_file_dictionaries_words"))
        )
          return;
        await restoreSettings(value);
        setSettings(value);
        await rpc({ action: "invalidate" });
        setNotice(t("settings_imported"));
      } else {
        const data = await readLearning(file);
        if (
          !confirm(
            t("replace_your_learning_data_with_words_reviews_and", {
              length: data.vocabulary.length,
              length1: data.reviews.length,
              length2: data.audio.length,
            }),
          )
        )
          return;
        await restoreLearning(data);
        sessionStorage.removeItem("last-review");
        await rpc({ action: "invalidate" });
        setNotice(t("learning_data_imported"));
      }
    });
  }
  async function finishSetup() {
    setBusy(true);
    setError("");
    try {
      if (
        morphologyLanguage(settings.studyLanguage) &&
        !(await db.morphology.get(settings.studyLanguage))
      )
        await installLanguageData("morphology");
      if (
        languageIso3(settings.studyLanguage) &&
        !(await rpc({ action: "exampleCorpus" })).installed
      )
        await installLanguageData("examples");

      setSettings(
        await rpc({
          action: "setSettings",
          value: { ...settings, setupComplete: true },
        }),
      );
      location.hash = "review";
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }
  return (
    <>
      {setup && <h1 className="setup-title">{t("setup")}</h1>}
      <section className="settings-section">
        <div className="section-heading">
          <h2>{t("languages")}</h2>
        </div>
        <label className="setting-row">
          <strong>{t("study_language")}</strong>
          <LanguageSelect
            label={t("study_language")}
            value={settings.studyLanguage}
            onChange={(studyLanguage) =>
              void update({ studyLanguage, voice: "" })
            }
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>{t("native_language")}</strong>
            {setup && (
              <small>
                {t("detected_language", {
                  language: languageName(systemLanguage()),
                })}
              </small>
            )}
          </span>
          <LanguageSelect
            label={t("native_language")}
            value={settings.nativeLanguage}
            onChange={(nativeLanguage) => void update({ nativeLanguage })}
          />
        </label>
        <label className="setting-row">
          <strong>{t("interface_language_setting")}</strong>
          <select
            aria-label={t("interface_language_setting")}
            value={settings.interfaceLanguage}
            onChange={(event) =>
              void update({
                interfaceLanguage: event.target
                  .value as Settings["interfaceLanguage"],
              })
            }
          >
            <option value="auto">{t("same_as_native_language")}</option>
            {interfaceLanguages.map((language) => (
              <option key={language} value={language}>
                {new Intl.DisplayNames([language], { type: "language" }).of(
                  language,
                )}
              </option>
            ))}
          </select>
        </label>
        <div className="setting-footnote">
          {t("read_and_collect_words_in_your_study_language")}{" "}
          {t("interface_language", {
            language: languageName(i18n.resolvedLanguage || "en"),
          })}
        </div>
      </section>
      <ErrorBox error={error} />
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      <section className="settings-section" id="word-forms">
        <div className="section-heading">
          <h2>{t("word_forms")}</h2>
        </div>
        <div className="setting-row">
          <strong>
            {morphology.count
              ? t("word_forms_count", { count: morphology.count })
              : t("no_additional_word_forms_installed")}
          </strong>
          <button
            disabled={busy || !morphologyLanguage(settings.studyLanguage)}
            onClick={() => void task(() => installLanguageData("morphology"))}
          >
            {morphology.count ? t("download_again") : t("download_word_forms")}
          </button>
        </div>
        {busy && progressTarget === "morphology" && progress && (
          <div className="setting-progress">
            <TaskProgress progress={progress} />
          </div>
        )}
        <div className="setting-footnote">
          {morphologyLanguage(settings.studyLanguage)
            ? t("extra_word_forms_from_simplemma_help_find_dictionary")
            : t("dictionary_word_forms_are_used_no_extra_simplemma")}
        </div>
      </section>
      <section className="settings-section" id="example-sentences">
        <div className="section-heading">
          <h2>{t("example_sentences")}</h2>
        </div>
        <div className="setting-row">
          <strong>
            {exampleCorpus.installed
              ? t("example_count", {
                  count: exampleCorpus.count,
                  language: languageName(settings.studyLanguage),
                })
              : t("no_examples_installed_for_this_study_language")}
          </strong>
          <div className="row">
            <button
              disabled={
                busy ||
                !settings.studyLanguage ||
                !languageIso3(settings.studyLanguage)
              }
              onClick={() => void task(() => installLanguageData("examples"))}
            >
              {exampleCorpus.installed
                ? t("update_examples")
                : t("download_examples")}
            </button>
            <label
              className={`button ${busy || !settings.studyLanguage ? "disabled" : ""}`}
            >
              {t("import_tsv")}{" "}
              <input
                type="file"
                accept=".tsv,.bz2"
                hidden
                disabled={busy || !settings.studyLanguage}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    void task(() => installLanguageData("examples", file));
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {busy && progressTarget === "examples" && progress && (
          <div className="setting-progress">
            <TaskProgress progress={progress} />
          </div>
        )}
        <div className="setting-footnote">
          {t("tatoeba_examples_for_your_study_language_are_stored")}{" "}
        </div>
      </section>
      <section className="settings-section">
        <div className="section-heading">
          <div>
            <h2>{t("dictionaries")}</h2>
          </div>
          <span className="count-pill">
            {t("dictionaries_installed", { count: dictionaries.length })}
          </span>
        </div>
        <div
          className="import-zone"
          aria-busy={busy && progressTarget === "dictionary"}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void fileImport(event.dataTransfer.files[0], "dictionary");
          }}
        >
          <div>
            {busy && progressTarget === "dictionary" && progress ? (
              <TaskProgress progress={progress} />
            ) : (
              <strong>{t("drop_a_yomitan_format_3_zip")}</strong>
            )}
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? t("working") : t("choose_zip")}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip"
            hidden
            onChange={(event) => {
              void fileImport(event.target.files?.[0], "dictionary");
              event.target.value = "";
            }}
          />
        </div>
        <div className="starter-note">
          <a
            href="https://yomitan.wiki/dictionaries/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("find_dictionaries")}{" "}
          </a>
        </div>
        <WiktionaryBrowser
          key={`${settings.studyLanguage}:${settings.nativeLanguage}`}
          language={settings.studyLanguage}
          nativeLanguage={settings.nativeLanguage}
          busy={busy}
          onImport={(entry) =>
            downloadDictionary(
              wiktionaryDownloadUrl(entry),
              entry.source,
              wiktionaryName(entry),
            )
          }
        />
        <FrequencyBrowser
          language={settings.studyLanguage}
          busy={busy}
          onImport={(entry) =>
            downloadDictionary(
              frequencyDownloadUrl(entry.file),
              entry.code,
              `${languageName(entry.code)} ${entry.source}`,
            )
          }
        />
        <div className="dictionary-list">
          {dictionaries.map((dictionary, i) => (
            <div className="dictionary-row" key={dictionary.id}>
              <label className="dictionary-toggle">
                <input
                  type="checkbox"
                  checked={dictionary.enabled}
                  disabled={busy}
                  onChange={(event) =>
                    void task(async () => {
                      await rpc({
                        action: "setDictionary",
                        id: dictionary.id,
                        enabled: event.target.checked,
                      });
                      load();
                    })
                  }
                />
                <span>
                  <strong>{dictionary.index.title}</strong>
                  <small>
                    {dictionary.count > 0
                      ? t("dictionary_entries", {
                          language: dictionary.language,
                          target: dictionary.target || t("unspecified"),
                          count: dictionary.count,
                        })
                      : dictionary.language}
                    {dictionary.frequencyCount > 0 &&
                      t("frequency_count", {
                        count: dictionary.frequencyCount,
                      })}
                    {" · "}
                    {t("dictionary_revision", {
                      revision: dictionary.index.revision,
                    })}
                  </small>
                </span>
              </label>
              <div className="dictionary-actions">
                <button
                  className="quiet"
                  disabled={busy || i === 0}
                  title={t("move_dictionary_up")}
                  aria-label={t("move_dictionary_up")}
                  onClick={() =>
                    void task(async () => {
                      await rpc({
                        action: "moveDictionary",
                        id: dictionary.id,
                        direction: "up",
                      });
                      load();
                    })
                  }
                >
                  ↑
                </button>
                <button
                  className="quiet"
                  disabled={busy || i === dictionaries.length - 1}
                  title={t("move_dictionary_down")}
                  aria-label={t("move_dictionary_down")}
                  onClick={() =>
                    void task(async () => {
                      await rpc({
                        action: "moveDictionary",
                        id: dictionary.id,
                        direction: "down",
                      });
                      load();
                    })
                  }
                >
                  ↓
                </button>
                {dictionary.index.isUpdatable && (
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        const result = await checkUpdate(dictionary);
                        setUpdates((u) => ({ ...u, [dictionary.id]: result }));
                        if (!result)
                          setNotice(
                            t("is_up_to_date", {
                              title: dictionary.index.title,
                            }),
                          );
                      })
                    }
                  >
                    {t("check_updates")}{" "}
                  </button>
                )}
                {updates[dictionary.id] && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        setProgressTarget("dictionary");
                        const phase = t("downloading_dictionary", {
                          title: dictionary.index.title,
                        });
                        setProgress({ phase, done: 0, total: 0 });
                        const response = await fetch(
                          updates[dictionary.id]!.url,
                          { credentials: "omit" },
                        );
                        if (!response.ok)
                          throw new Error(
                            t("dictionary_download_failed", {
                              status: response.status,
                            }),
                          );
                        const blob = await readDownload(
                          response,
                          phase,
                          setProgress,
                        );
                        await importZip(blob, dictionary.id);
                        setUpdates((u) => ({ ...u, [dictionary.id]: null }));
                      })
                    }
                  >
                    {t("update_dictionary_revision", {
                      revision: updates[dictionary.id]!.revision,
                    })}
                  </button>
                )}
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      const archive = await db.archives.get(
                        dictionary.revisionId,
                      );
                      if (!archive)
                        throw new Error(t("dictionary_archive_unavailable"));
                      saveBlob(archive.blob, `${dictionary.index.title}.zip`);
                    })
                  }
                >
                  {t("export_zip")}{" "}
                </button>
                <button
                  className="quiet danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        t("remove_your_saved_words_and_reviews_will_stay", {
                          title: dictionary.index.title,
                        }),
                      )
                    )
                      void task(async () => {
                        await rpc({
                          action: "deleteDictionary",
                          id: dictionary.id,
                        });
                        load();
                      });
                  }}
                >
                  {t("remove")}{" "}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-section" id="controls">
        <div className="section-heading">
          <h2>{t("lookup_controls")}</h2>
        </div>
        <LookupControls
          value={settings.lookupBindings}
          onChange={(lookupBindings) => void update({ lookupBindings })}
        />
        <details className="input-prevention">
          <summary>{t("input_action_prevention")}</summary>
          <p className="muted">
            {t("active_only_for_matching_mouse_lookup_bindings_block")}{" "}
          </p>
          <div className="prevention-groups">
            {(
              [
                ["preventMiddleMouse", t("middle_mouse_button")],
                ["preventBackForward", t("back_forward_mouse_buttons")],
              ] as const
            ).map(([key, label]) => (
              <fieldset
                key={key}
                disabled={
                  !settings.lookupBindings.some(
                    (binding) =>
                      binding.type === "mouse" &&
                      (key === "preventMiddleMouse"
                        ? binding.button === 1
                        : binding.button === 3 || binding.button === 4),
                  )
                }
              >
                <legend>{label}</legend>
                {(
                  [
                    ["textHover", t("text_hover")],
                    ["webpages", t("webpages")],
                    ["popups", t("lookup_popups")],
                    ["extensionPages", t("extension_pages")],
                    ["searchFields", t("search_fields")],
                  ] as const
                ).map(([scope, name]) => (
                  <label key={scope}>
                    <input
                      type="checkbox"
                      checked={settings[key][scope]}
                      onChange={(event) =>
                        void update({
                          [key]: {
                            ...settings[key],
                            [scope]: event.target.checked,
                          },
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </details>
      </section>
      {setup ? (
        <div className="setup-footer">
          <button
            className="primary"
            disabled={
              busy ||
              !settings.lookupBindings.length ||
              !dictionaries.some(
                (dictionary) =>
                  dictionary.enabled &&
                  dictionary.language === settings.studyLanguage &&
                  dictionary.count > 0,
              )
            }
            onClick={() => void finishSetup()}
          >
            {t("finish_setup")}{" "}
          </button>
        </div>
      ) : (
        <>
          <div className="settings-columns">
            <section className="settings-section">
              <div className="section-heading">
                <div>
                  <h2>{t("reading_appearance")}</h2>
                </div>
              </div>
              <label className="setting-row">
                <span>
                  <strong>{t("parse_websites_automatically")}</strong>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={!settings.paused}
                  onChange={(event) =>
                    void update({ paused: !event.target.checked })
                  }
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>{t("only_parse_the_reading_language")}</strong>
                  <small>{t("skips_text_detected_as_another_language")}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.detectPageLanguage}
                  onChange={(event) =>
                    void update({ detectPageLanguage: event.target.checked })
                  }
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>{t("appearance")}</strong>
                </span>
                <select
                  value={settings.theme}
                  onChange={(event) =>
                    void update({
                      theme: event.target.value as Settings["theme"],
                    })
                  }
                >
                  <option value="system">{t("system")}</option>
                  <option value="light">{t("light")}</option>
                  <option value="dark">{t("dark")}</option>
                </select>
              </label>
              <label className="setting-row">
                <span>
                  <strong>{t("hide_dictionary_source_links")}</strong>
                  <small>{t("in_lookup_popups")}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.hideDictionarySources}
                  onChange={(event) =>
                    void update({ hideDictionarySources: event.target.checked })
                  }
                />
              </label>
              {!!settings.disabledHosts.length && (
                <div className="setting-stack">
                  <strong>{t("disabled_websites")}</strong>
                  {settings.disabledHosts.map((host) => (
                    <div className="row between" key={host}>
                      <span>{host}</span>
                      <button
                        className="link"
                        onClick={() =>
                          void update({
                            disabledHosts: settings.disabledHosts.filter(
                              (h) => h !== host,
                            ),
                          })
                        }
                      >
                        {t("enable")}{" "}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="setting-row">
                <strong>{t("scan_dictionary_popups")}</strong>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.scanPopups}
                  onChange={(event) =>
                    void update({ scanPopups: event.target.checked })
                  }
                />
              </label>
              <WordColors
                settings={settings}
                onChange={(patch) => void update(patch)}
              />
              <div className="setting-footnote">
                {t("disable_individual_sites_from_the_toolbar")}{" "}
              </div>
            </section>
            <section className="settings-section">
              <div className="section-heading">
                <div>
                  <h2>{t("spaced_repetition")}</h2>
                </div>
              </div>
              <label className="setting-row">
                <span>
                  <strong>{t("use_only_again_and_good")}</strong>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.onlyAgainGood}
                  onChange={(event) =>
                    void update({ onlyAgainGood: event.target.checked })
                  }
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>{t("new_words_per_day")}</strong>
                  <small>{t("does_not_limit_reviews_while_reading")}</small>
                </span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={settings.newLimit}
                  onChange={(event) => {
                    if (event.target.value !== "")
                      void update({ newLimit: Number(event.target.value) });
                  }}
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>{t("words_without_frequency")}</strong>
                </span>
                <select
                  value={settings.missingFrequency}
                  onChange={(event) =>
                    void update({
                      missingFrequency: event.target
                        .value as Settings["missingFrequency"],
                    })
                  }
                >
                  <option value="last">{t("introduce_last")}</option>
                  <option value="random">{t("assign_random_frequency")}</option>
                </select>
              </label>
              <label className="setting-row">
                <span>
                  <strong>{t("desired_retention")}</strong>
                  <small>{t("70_99_higher_values_mean_more_reviews")}</small>
                </span>
                <div className="input-suffix">
                  <input
                    type="number"
                    min={70}
                    max={99}
                    value={Math.round(settings.retention * 100)}
                    onChange={(event) => {
                      if (event.target.value !== "")
                        void update({
                          retention: Number(event.target.value) / 100,
                        });
                    }}
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="setting-row">
                <strong>{t("show_sentence_translations")}</strong>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.showSentenceTranslation}
                  onChange={(event) =>
                    void update({
                      showSentenceTranslation: event.target.checked,
                    })
                  }
                />
              </label>
              <label className="setting-row">
                <span>
                  <strong>{t("default_card_front")}</strong>
                </span>
                <select
                  value={settings.front}
                  onChange={(event) =>
                    void update({
                      front: event.target.value as Settings["front"],
                    })
                  }
                >
                  <option value="word">{t("word_only")}</option>
                  <option value="sentence">{t("word_in_sentence")}</option>
                </select>
              </label>
              <div className="setting-footnote">
                {t("new_words_follow_combined_frequency_ranks_from_most")}{" "}
              </div>
            </section>
          </div>
          <section className="settings-section">
            <div className="section-heading">
              <h2>{t("translation")}</h2>
            </div>
            <div className="setting-footnote">
              {t("translation_stays_on_your_device_models_download_on")}{" "}
            </div>
          </section>
          <section className="settings-section">
            <div className="section-heading">
              <div>
                <h2>{t("pronunciation")}</h2>
              </div>
            </div>
            <label className="setting-row">
              <span>
                <strong>{t("download_natural_pronunciations")}</strong>
                <small>
                  {t(
                    "downloads_from_wikimedia_commons_when_playing_or_saving",
                  )}{" "}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.audioDownloads}
                onChange={(event) =>
                  void update({ audioDownloads: event.target.checked })
                }
              />
            </label>
            <label className="setting-row">
              <span>
                <strong>{t("local_voice")}</strong>
                <small>
                  {voices.some(
                    (v) => v.lang.split("-")[0] === settings.studyLanguage,
                  )
                    ? t("used_for_sentences_and_missing_recordings")
                    : t("no_voice_found_install_one_in_your_system", {
                        value1: languageName(settings.studyLanguage),
                      })}
                </small>
              </span>
              <select
                value={settings.voice}
                onChange={(event) => void update({ voice: event.target.value })}
              >
                <option value="">{t("automatic")}</option>
                {voices
                  .filter(
                    (v) => v.lang.split("-")[0] === settings.studyLanguage,
                  )
                  .map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="setting-row">
              <span>
                <strong>{t("play_audio_on_reveal")}</strong>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.autoplay}
                onChange={(event) =>
                  void update({ autoplay: event.target.checked })
                }
              />
            </label>
          </section>
          <section className="settings-section">
            <div className="section-heading">
              <div>
                <h2>{t("import_export")}</h2>
              </div>
            </div>
            <div className="backup-grid">
              <div>
                <h3>{t("settings")}</h3>
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => void task(exportSettings)}
                  >
                    {t("export_json")}{" "}
                  </button>
                  <label className={`button ${busy ? "disabled" : ""}`}>
                    {t("import_json")}{" "}
                    <input
                      type="file"
                      accept=".json"
                      hidden
                      disabled={busy}
                      onChange={(event) => {
                        void fileImport(event.target.files?.[0], "settings");
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <div>
                <h3>{t("words_progress")}</h3>
                <p>{t("includes_sentences_review_history_and_saved_audio")}</p>
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => void task(exportLearning)}
                  >
                    {t("export_zip")}{" "}
                  </button>
                  <label className={`button ${busy ? "disabled" : ""}`}>
                    {t("import_zip")}{" "}
                    <input
                      type="file"
                      accept=".zip"
                      hidden
                      disabled={busy}
                      onChange={(event) => {
                        void fileImport(event.target.files?.[0], "learning");
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="setting-footnote">
              {t(
                "imports_replace_the_selected_category_export_your_progress",
              )}{" "}
            </div>
          </section>
          <a className="setup-link" href="#setup">
            {t("open_setup")}{" "}
          </a>
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
