import { AudioButton } from "@/audio/AudioButton";
import { playBlob, speak, stopAudio } from "@/audio/playback";
import { Meanings } from "@/dictionaries/Meanings";
import type { Settings } from "@/settings/model";
import { db } from "@/shared/db";
import { t } from "@/shared/i18n/i18n";
import { rpc } from "@/shared/rpc";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { useChanges } from "@/shared/useChanges";
import { Ratings, intervalLabel } from "@/srs/Ratings";
import { SrsProgress } from "@/srs/SrsProgress";
import { useReviewClock } from "@/srs/useReviewClock";
import { SentenceTranslation } from "@/translation/SentenceTranslation";
import { Sentence } from "@/vocabulary/Sentence";
import { Check, Eye, Pause, Undo2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function ReviewPage({
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
  const duration = useReviewClock(`${word?.id}:${word?.card?.reps}`);
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
  }, [word?.id, word?.card?.reps]);
  useEffect(() => {
    if (!word) return;
    let alive = true;
    setTimes([]);
    void rpc({ action: "preview", id: word.id, durationMs: duration() })
      .then((value) => {
        if (alive) setTimes(value);
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [word?.id, word?.srsVersion, settings, revealed, duration]);
  useEffect(() => {
    if (!queue?.wakeAt) return;
    const timer = setTimeout(
      load,
      Math.min(Math.max(500, queue.wakeAt - Date.now() + 50), 60000),
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
        version: word.srsVersion,
        source: "review",
        durationMs: duration(),
        time: Date.now(),
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
        if (recording) await playBlob(recording.blob, settings.normalizeAudio);
        else await speak(word.lemma, word.language, settings.voice);
      })().catch((error) => setError(error.message));
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest('[role="menu"]')) return;
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
      <SrsProgress />
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
                    <Eye aria-hidden="true" /> {t("show_answer")}{" "}
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
                  <Upload aria-hidden="true" /> {t("import_dictionary")}
                </a>
              )}
            </Empty>
          )}
          <footer className="review-bottom">
            <button
              title={t("undo_last_review")}
              aria-label={t("undo_last_review")}
              className="quiet icon-button"
              disabled={!last || busy}
              onClick={() => void undo()}
            >
              <Undo2 aria-hidden="true" />
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
                <Check aria-hidden="true" /> {t("master")}{" "}
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
                <Pause aria-hidden="true" /> {t("suspend_word")}{" "}
              </button>
            )}
          </footer>
        </section>
      </div>
    </>
  );
}
