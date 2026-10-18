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
import "../../src/styles.css";
import { supportedLanguages, languageName } from "../../src/languages";
import { LookupControls } from "../../src/LookupControls";
import { WordColors } from "../../src/WordColors";
import { wordStates, wordStateLabels } from "../../src/word-styles";
import {
  FrequencyBrowser,
  frequencyDownloadUrl,
} from "../../src/FrequencyBrowser";

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
            <nav aria-label="Pages">
              {[
                ["review", "Review"],
                ["words", "Words"],
                ["settings", "Settings"],
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
  }, [word?.id, word?.version]);
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
          Due <strong>{queue?.due ?? "—"}</strong>
        </span>
        <span>
          New <strong>{queue?.fresh ?? "—"}</strong>
        </span>
        <span>
          Reviewed today <strong>{stats.today}</strong>
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
                Word
              </button>
              <button
                className={front === "sentence" ? "selected" : ""}
                onClick={() => setFront("sentence")}
              >
                In context
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
                  <Meanings meanings={word.meanings} />
                  {context && (
                    <div className="sentence-box">
                      <Sentence context={context} language={word.language} />
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
                          Another example ({example + 1}/{word.contexts.length})
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
                    Show answer <span className="keycap">Space</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <Empty
              title={
                queue?.waiting
                  ? "No reviews due."
                  : stats.total
                    ? "No reviews due."
                    : "No saved words."
              }
            >
              <p>
                {queue?.waiting
                  ? `Next review in ${intervalLabel(queue.waiting)}.`
                  : stats.total
                    ? ""
                    : "Use your lookup control on a word to save it."}
              </p>
              {!stats.total && (
                <a className="button primary" href="#settings">
                  Import dictionary
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
              ↶ Undo last review
            </button>
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
                Suspend word
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
          aria-label="Search saved words"
          placeholder="Search words"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filter words"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          {[
            ["all", "All words"],
            ...wordStates
              .filter((state) => state !== "unknown")
              .map((state) => [state, wordStateLabels[state]]),
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!visible.length ? (
        <section className="panel">
          <Empty title="No words found.">
            <p>
              {query || filter !== "all"
                ? ""
                : "Save a word from a website to add it here."}
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
                      "Open to see definitions"}
                  </span>
                </div>
                <span className={`state state-${stateOf(w)}`}>
                  {wordStateLabels[stateOf(w)]}
                </span>
              </button>
            ))}
          </section>
          {word && (
            <section className="word-detail panel">
              <div className="row between">
                <button
                  className="icon-button"
                  aria-label="Close word details"
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
                    Definition
                    <textarea
                      rows={7}
                      value={definition}
                      onChange={(event) => setDefinition(event.target.value)}
                    />
                  </label>
                  <p className="muted small-text">
                    Saving replaces the dictionary snapshot for this card.
                    Refresh from the dictionary to restore it.
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
                      Save definition
                    </button>
                    <button className="quiet" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <Meanings meanings={word.meanings} />
              )}
              {word.contexts.map((context, i) => (
                <div className="sentence-box" key={i}>
                  <Sentence context={context} language={word.language} />
                  <div className="sentence-footer">
                    <span className="truncate">{context.title}</span>
                    <button
                      className="link"
                      onClick={() => {
                        const sentence = prompt(
                          "Edit this sentence. The encountered word must remain in it.",
                          context.sentence,
                        );
                        if (sentence === null) return;
                        const start = sentence.indexOf(context.surface);
                        if (start < 0) {
                          setError(
                            `Keep “${context.surface}” in the sentence.`,
                          );
                          return;
                        }
                        const contexts = word.contexts.map((c, j) =>
                          j === i
                            ? {
                                ...c,
                                sentence,
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
                      Edit sentence
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
              {word.card && (
                <div className="schedule-info">
                  <span>Next review</span>
                  <strong>{new Date(word.card.due).toLocaleString()}</strong>
                  <span>
                    {word.card.reps} reviews · {word.card.lapses} lapses
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
                  Edit definition
                </button>
                <button
                  className="quiet"
                  onClick={() =>
                    void action(() =>
                      rpc({ action: "refreshWord", id: word.id }),
                    )
                  }
                >
                  Refresh from dictionary
                </button>
                <button
                  className="quiet"
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
                  {word.known ? "Unmark known" : "Mark known"}
                </button>
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
                  {word.suspended ? "Resume" : "Suspend"}
                </button>
                <button
                  className="danger quiet"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete “${word.lemma}”, its review history, and its recording?`,
                      )
                    )
                      void action(async () => {
                        await rpc({ action: "deleteWord", id: word.id });
                        setSelected("");
                      });
                  }}
                >
                  Delete word
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [updates, setUpdates] = useState<
    Record<string, { revision: string; url: string } | null>
  >({});
  const worker = useRef<Worker | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
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
    language: string = settings.language,
  ) {
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
        reject(new Error(event.message || "Dictionary import failed."));
      };
      current.postMessage({ blob, language, expectedId });
    });
    await rpc({ action: "invalidate" });
    load();
    setNotice("Dictionary imported.");
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
          !confirm(
            "Replace your settings with this file? Dictionaries, words, and reviews will stay on this device.",
          )
        )
          return;
        await restoreSettings(value);
        setSettings(value);
        await rpc({ action: "invalidate" });
        setNotice("Settings imported.");
      } else {
        const data = await readLearning(file);
        if (
          !confirm(
            `Replace your learning data with ${data.vocabulary.length} words, ${data.reviews.length} reviews, and ${data.audio.length} recordings? Export your current learning data first if you want to keep it.`,
          )
        )
          return;
        await restoreLearning(data);
        sessionStorage.removeItem("last-review");
        await rpc({ action: "invalidate" });
        setNotice("Learning data imported.");
      }
    });
  }
  async function finishSetup() {
    setBusy(true);
    setError("");
    try {
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
    }
  }
  return (
    <>
      {setup && <h1 className="setup-title">Setup</h1>}
      <ErrorBox error={error} />
      {notice && (
        <div className="notice success" role="status">
          {notice}
        </div>
      )}
      <section className="settings-section">
        <div className="section-heading">
          <div>
            <h2>Dictionaries</h2>
          </div>
          <span className="count-pill">{dictionaries.length} installed</span>
        </div>
        <label className="setting-row">
          <span>Language</span>
          <select
            aria-label="Language"
            value={settings.language}
            onChange={(event) =>
              void update({
                language: event.target.value as Settings["language"],
                voice: "",
              })
            }
          >
            {supportedLanguages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
        <div
          className={`import-zone ${busy ? "disabled" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void fileImport(event.dataTransfer.files[0], "dictionary");
          }}
        >
          <div>
            <strong>
              {progress ? progress.phase : "Drop a Yomitan format-3 ZIP"}
            </strong>
            <p>
              {progress ? "Keep this page open until the import finishes." : ""}
            </p>
            {progress && (
              <progress
                max={Math.max(1, progress.total)}
                value={progress.done}
              />
            )}
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? "Working…" : "Choose ZIP"}
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
          {!dictionaries.some(
            (d) => d.count > 0 && d.language === settings.language,
          ) && (
            <a
              href={
                supportedLanguages.find(
                  (language) => language.code === settings.language,
                )!.dictionaryUrl
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Download {languageName(settings.language)} dictionary
            </a>
          )}
        </div>
        <FrequencyBrowser
          language={settings.language}
          busy={busy}
          onImport={(entry) =>
            task(async () => {
              setProgress({
                phase: `Downloading ${entry.language} ${entry.source}…`,
                done: 0,
                total: 0,
              });
              const response = await fetch(frequencyDownloadUrl(entry.file), {
                credentials: "omit",
              });
              if (!response.ok)
                throw new Error(
                  `Dictionary download failed (${response.status}).`,
                );
              await importZip(await response.blob(), undefined, entry.code);
            })
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
                      ? `${dictionary.language} → ${dictionary.target || "unspecified"} · ${dictionary.count.toLocaleString()} entries`
                      : dictionary.language}
                    {dictionary.frequencyCount > 0 &&
                      ` · ${dictionary.frequencyCount.toLocaleString()} frequency ranks`}
                    {" · rev. "}
                    {dictionary.index.revision}
                  </small>
                </span>
              </label>
              <div className="dictionary-actions">
                <button
                  className="quiet"
                  disabled={busy || i === 0}
                  title="Move dictionary up"
                  onClick={() =>
                    void task(async () => {
                      const previous = dictionaries[i - 1]!;
                      await rpc({
                        action: "setDictionary",
                        id: dictionary.id,
                        order: previous.order,
                      });
                      await rpc({
                        action: "setDictionary",
                        id: previous.id,
                        order: dictionary.order,
                      });
                      load();
                    })
                  }
                >
                  ↑
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
                          setNotice(`${dictionary.index.title} is up to date.`);
                      })
                    }
                  >
                    Check updates
                  </button>
                )}
                {updates[dictionary.id] && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        const response = await fetch(
                          updates[dictionary.id]!.url,
                          { credentials: "omit" },
                        );
                        if (!response.ok)
                          throw new Error(
                            `Dictionary download failed (${response.status}).`,
                          );
                        await importZip(await response.blob(), dictionary.id);
                        setUpdates((u) => ({ ...u, [dictionary.id]: null }));
                      })
                    }
                  >
                    Update to {updates[dictionary.id]!.revision}
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
                        throw new Error("Dictionary archive unavailable.");
                      saveBlob(archive.blob, `${dictionary.index.title}.zip`);
                    })
                  }
                >
                  Export ZIP
                </button>
                <button
                  className="quiet danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        `Remove ${dictionary.index.title}? Your saved words and reviews will stay.`,
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
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-section" id="controls">
        <div className="section-heading">
          <h2>Lookup controls</h2>
        </div>
        <LookupControls
          value={settings.lookupBindings}
          onChange={(lookupBindings) => void update({ lookupBindings })}
        />
        <details className="input-prevention">
          <summary>Input action prevention</summary>
          <p className="muted">
            Active only for matching mouse lookup bindings. Block opening links
            in a new tab, autoscroll, or history navigation in these locations.
          </p>
          <div className="prevention-groups">
            {(
              [
                ["preventMiddleMouse", "Middle mouse button"],
                ["preventBackForward", "Back/forward mouse buttons"],
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
                    ["textHover", "Text hover"],
                    ["webpages", "Webpages"],
                    ["popups", "Lookup popups"],
                    ["extensionPages", "Extension pages"],
                    ["searchFields", "Search fields"],
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
                  dictionary.language === settings.language &&
                  dictionary.count > 0,
              )
            }
            onClick={() => void finishSetup()}
          >
            Finish setup
          </button>
        </div>
      ) : (
        <>
          <div className="settings-columns">
            <section className="settings-section">
              <div className="section-heading">
                <div>
                  <h2>Reading & appearance</h2>
                </div>
              </div>
              <label className="setting-row">
                <span>
                  <strong>Parse websites automatically</strong>
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
                  <strong>Appearance</strong>
                </span>
                <select
                  value={settings.theme}
                  onChange={(event) =>
                    void update({
                      theme: event.target.value as Settings["theme"],
                    })
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="setting-row">
                <span>
                  <strong>Hide dictionary source links</strong>
                  <small>In lookup popups.</small>
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
                  <strong>Disabled websites</strong>
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
                        Enable
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="setting-row">
                <strong>Scan dictionary popups</strong>
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
                Disable individual sites from the toolbar.
              </div>
            </section>
            <section className="settings-section">
              <div className="section-heading">
                <div>
                  <h2>Spaced repetition</h2>
                </div>
              </div>
              <label className="setting-row">
                <span>
                  <strong>Use only Again and Good</strong>
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
                  <strong>New words per day</strong>
                  <small>Does not limit reviews while reading.</small>
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
                  <strong>Words without frequency</strong>
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
                  <option value="last">Introduce last</option>
                  <option value="random">Assign random frequency</option>
                </select>
              </label>
              <label className="setting-row">
                <span>
                  <strong>Desired retention</strong>
                  <small>70–99%. Higher values mean more reviews.</small>
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
                <span>
                  <strong>Default card front</strong>
                </span>
                <select
                  value={settings.front}
                  onChange={(event) =>
                    void update({
                      front: event.target.value as Settings["front"],
                    })
                  }
                >
                  <option value="word">Word only</option>
                  <option value="sentence">Word in sentence</option>
                </select>
              </label>
              <div className="setting-footnote">
                New words follow the first enabled frequency dictionary, from
                most common to least common. Retention changes apply to future
                reviews.
              </div>
            </section>
          </div>
          <section className="settings-section">
            <div className="section-heading">
              <div>
                <h2>Pronunciation</h2>
              </div>
            </div>
            <label className="setting-row">
              <span>
                <strong>Download natural pronunciations</strong>
                <small>
                  Downloads from Wikimedia Commons when playing or saving a
                  word. Only the word is sent.
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
                <strong>Local voice</strong>
                <small>
                  {voices.some(
                    (v) => v.lang.split("-")[0] === settings.language,
                  )
                    ? "Used for sentences and missing recordings."
                    : `No ${languageName(settings.language)} voice found. Install one in your system settings.`}
                </small>
              </span>
              <select
                value={settings.voice}
                onChange={(event) => void update({ voice: event.target.value })}
              >
                <option value="">Automatic</option>
                {voices
                  .filter((v) => v.lang.split("-")[0] === settings.language)
                  .map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="setting-row">
              <span>
                <strong>Play audio on reveal</strong>
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
                <h2>Import & export</h2>
              </div>
            </div>
            <div className="backup-grid">
              <div>
                <h3>Settings</h3>
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => void task(exportSettings)}
                  >
                    Export JSON
                  </button>
                  <label className={`button ${busy ? "disabled" : ""}`}>
                    Import JSON
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
                <h3>Words & progress</h3>
                <p>Includes sentences, review history, and saved audio.</p>
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => void task(exportLearning)}
                  >
                    Export ZIP
                  </button>
                  <label className={`button ${busy ? "disabled" : ""}`}>
                    Import ZIP
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
              Imports replace the selected category. Export your progress before
              uninstalling.
            </div>
          </section>
          <a className="setup-link" href="#setup">
            Open setup
          </a>
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
