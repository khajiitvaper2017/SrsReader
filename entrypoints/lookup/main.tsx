import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { rpc } from "../../src/api";
import {
  folded,
  stateOf,
  type LookupResult,
  type LookupWord,
  type ReadingContext,
  type Vocabulary,
} from "../../src/model";
import {
  AudioButton,
  Empty,
  ErrorBox,
  Icon,
  Meanings,
  Ratings,
  useChanges,
  useSettings,
} from "../../src/ui";
import "../../src/styles.css";

function Lookup() {
  const [settings, setSettings] = useSettings("popups");
  const [result, setResult] = useState<LookupResult>();
  const [term, setTerm] = useState("");
  const [context, setContext] = useState<ReadingContext>();
  const [selected, setSelected] = useState("");
  const [saved, setSaved] = useState<Vocabulary>();
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastReview, setLastReview] = useState("");
  const word: LookupWord | undefined = result?.words.find(
    (w) => w.id === selected,
  );
  useEffect(() => {
    const session = new URLSearchParams(location.search).get("session");
    if (!session) return;
    const body = document.querySelector<HTMLElement>(".lookup-body")!;
    const resize = () => {
      const actions = document.querySelector<HTMLElement>(".lookup-actions");
      void rpc({
        action: "resizeLookup",
        session,
        height: Math.min(
          460,
          Math.ceil(
            body.getBoundingClientRect().height +
              (actions?.offsetHeight || 0) +
              20,
          ),
        ),
      }).catch(console.warn);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(body);
    const actions = document.querySelector(".lookup-actions");
    if (actions) observer.observe(actions);
    resize();
    return () => observer.disconnect();
  }, [word?.id]);
  useEffect(() => {
    const session = new URLSearchParams(location.search).get("session");
    if (!session) {
      setError("Use your lookup control on a word on a website.");
      return;
    }
    void rpc({ action: "session", id: session })
      .then(async (value) => {
        setTerm(value.term);
        setContext(value.context);
        const lookup = await rpc({ action: "lookup", term: value.term });
        setResult(lookup);
        setSelected(lookup.words[0]?.id || "");
      })
      .catch((error) => setError(error.message));
  }, []);
  const reload = useCallback(() => {
    if (!selected || !term) return;
    void Promise.all([
      rpc({ action: "word", id: selected }),
      rpc({ action: "preview", id: selected }),
      rpc({ action: "settings" }),
      rpc({ action: "lookup", term }),
    ])
      .then(([word, times, settings, result]) => {
        setSaved(word);
        setTimes(times);
        setSettings(settings);
        setResult(result);
      })
      .catch((error) => setError(error.message));
  }, [selected, term]);
  useEffect(reload, [reload]);
  useChanges(reload);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void rpc({ action: "closeLookup" });
        return;
      }
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        )
      )
        return;
      const rating = Number(event.key);
      if (
        rating >= 1 &&
        rating <= 4 &&
        !busy &&
        (!settings.onlyAgainGood || rating === 1 || rating === 3)
      ) {
        event.preventDefault();
        void act(rating);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  async function act(rating?: number) {
    if (!word) return;
    setBusy(true);
    setError("");
    try {
      if (rating) {
        const result = await rpc({
          action: "grade",
          id: word.id,
          term,
          rating,
          version: saved?.version || 0,
          source: "reading",
          context,
        });
        setSaved(result.word);
        setLastReview(result.reviewId);
        setNotice(
          `Reviewed · ${["Again", "Hard", "Good", "Easy"][rating - 1]}`,
        );
      } else {
        setSaved(await rpc({ action: "mine", id: word.id, term, context }));
        setNotice("Saved");
      }
      reload();
    } catch (error) {
      setError((error as Error).message);
      reload();
    } finally {
      setBusy(false);
    }
  }
  async function known() {
    if (!word) return;
    setBusy(true);
    try {
      setSaved(
        await rpc({ action: "known", id: word.id, term, value: !saved?.known }),
      );
      setNotice(saved?.known ? "Marked unknown" : "Marked known");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`lookup-shell ${settings.hideDictionarySources ? "hide-dictionary-sources" : ""}`}
    >
      <button
        className="quiet lookup-close"
        aria-label="Close dictionary"
        onClick={() => void rpc({ action: "closeLookup" })}
      >
        <Icon name="close" />
      </button>
      <main className="lookup-content">
        <div className="lookup-body">
          <ErrorBox error={error} />
          {!result && !error && <p className="muted">Looking up…</p>}
          {result && !word && (
            <Empty title="No definition found">
              <p>
                {result.unresolved.length
                  ? `Reference target unavailable: ${result.unresolved.join(", ")}`
                  : `No enabled dictionary defines “${term}”.`}
              </p>
              <p>Try another dictionary or check for an update.</p>
            </Empty>
          )}
          {word && (
            <>
              {result!.words.length > 1 && (
                <label className="candidate">
                  <select
                    aria-label="Word"
                    value={selected}
                    onChange={(event) => {
                      setSelected(event.target.value);
                      setNotice("");
                      setLastReview("");
                    }}
                  >
                    {result!.words.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.lemma}
                        {w.reading ? ` · ${w.reading}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="word-heading">
                <div>
                  {saved && (
                    <span className={`state state-${stateOf(saved)}`}>
                      {stateOf(saved)}
                    </span>
                  )}
                  <h1 lang={word.language}>
                    {folded(term, word.language) !==
                      folded(word.lemma, word.language) && (
                      <span className="surface-form">{term} → </span>
                    )}
                    {word.lemma}
                  </h1>
                  {word.reading && (
                    <span className="muted">{word.reading}</span>
                  )}
                </div>
                <AudioButton
                  word={word}
                  settings={settings}
                  onError={setError}
                />
              </div>
              {word.forms.filter((form) => !form.startsWith("redirected from "))
                .length > 0 && (
                <div className="muted small-text">
                  {[
                    ...new Set(
                      word.forms.filter(
                        (form) => !form.startsWith("redirected from "),
                      ),
                    ),
                  ].join(" · ")}
                </div>
              )}
              <Meanings meanings={word.meanings} />
            </>
          )}
        </div>
      </main>
      {word && (
        <section className="lookup-actions">
          <div className="lookup-action-row">
            <div className="row mining-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => void act()}
              >
                <Icon name={saved?.card ? "check" : "plus"} />
                {saved?.card ? "Save example" : "Mine word"}
              </button>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => void known()}
              >
                {saved?.known ? "Unmark known" : "I know this"}
              </button>
            </div>
            {saved?.suspended ? (
              <button
                className="quiet"
                onClick={() =>
                  void rpc({
                    action: "suspend",
                    id: word.id,
                    value: false,
                  }).then(reload)
                }
              >
                Resume
              </button>
            ) : (
              <>
                <Ratings
                  times={times}
                  disabled={busy}
                  onlyAgainGood={settings.onlyAgainGood}
                  onGrade={(rating) => void act(rating)}
                />
              </>
            )}
          </div>
          {notice && (
            <div className="success-note" role="status">
              {notice}
              {lastReview && (
                <button
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void rpc({ action: "undo", id: lastReview })
                      .then(() => {
                        setLastReview("");
                        setNotice("Review undone");
                        reload();
                      })
                      .catch((error) => setError(error.message))
                  }
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Lookup />);
