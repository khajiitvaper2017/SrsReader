import { t } from "../../src/i18n";
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
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { startReader } from "../../src/reader";
import { FrequencyBadge } from "../../src/FrequencyBadge";
import { wordStateLabels } from "../../src/word-styles";
import { readerKeysSchema } from "../../src/controls";
import { SentenceTranslation } from "../../src/SentenceTranslation";
import { WordExamples } from "../../src/WordExamples";

type LookupPage = {
  term: string;
  context?: ReadingContext;
  selected?: string;
  scroll?: number;
  openDetails?: number[];
};

function Lookup() {
  const [pages, setPages] = useState<LookupPage[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const session = new URLSearchParams(location.search).get("session");
    if (!session) {
      setError(t("use_your_lookup_control_on_a_word_on"));
      return;
    }
    void rpc({ action: "session", id: session })
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
      else void rpc({ action: "closeLookup" });
    };
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "srs-reader-ready", session }, "*");
    return () => window.removeEventListener("message", listener);
  }, [pages.length]);
  if (!pages.length) return <ErrorBox error={error} />;
  return (
    <LookupEntry
      key={pages.length}
      page={pages[pages.length - 1]!}
      onContext={(context) =>
        setPages((current) =>
          current.map((page, index) =>
            index === pages.length - 1 &&
            page.term === pages[pages.length - 1]!.term
              ? { ...page, context }
              : page,
          ),
        )
      }
      onLookup={(term, context, selected, scroll, openDetails) =>
        setPages((pages) => [
          ...pages.slice(0, -1),
          { ...pages[pages.length - 1]!, selected, scroll, openDetails },
          { term, context },
        ])
      }
      onBack={
        pages.length > 1
          ? () => setPages((pages) => pages.slice(0, -1))
          : undefined
      }
    />
  );
}

function LookupEntry({
  page,
  onLookup,
  onBack,
  onContext,
}: {
  page: LookupPage;
  onLookup: (
    term: string,
    context: ReadingContext,
    selected: string,
    scroll: number,
    openDetails: number[],
  ) => void;
  onBack?: () => void;
  onContext: (context: ReadingContext) => void;
}) {
  const [settings, setSettings] = useSettings("popups");
  const [result, setResult] = useState<LookupResult>();
  const { term, context } = page;
  const [selected, setSelected] = useState(page.selected || "");
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
    if (!word) return;
    const root = document.querySelector<HTMLElement>(".lookup-reading")!;
    const content = document.querySelector<HTMLElement>(".lookup-content")!;
    if (page.selected === selected && page.openDetails)
      [...root.querySelectorAll("details")].forEach((details, index) => {
        details.open = page.openDetails!.includes(index);
      });
    content.scrollTop = page.scroll || 0;
    const ctx = new ContentScriptContext("popup-reader");
    startReader(ctx, {
      root,
      source: {
        url: word.meanings[0]?.sourceUrl || location.href,
        title: word.meanings[0]?.title || document.title,
      },
      onLookup: (term, context) =>
        onLookup(
          term,
          context,
          selected,
          content.scrollTop,
          [...root.querySelectorAll("details")].flatMap((details, index) =>
            details.open ? [index] : [],
          ),
        ),
    });
    return () => ctx.abort();
  }, [word?.id]);
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
    let alive = true;
    void rpc({ action: "lookup", term })
      .then((lookup) => {
        if (!alive) return;
        setResult(lookup);
        setSelected(
          lookup.words.some((word) => word.id === page.selected)
            ? page.selected!
            : lookup.words[0]?.id || "",
        );
      })
      .catch((error) => setError(error.message));
    return () => {
      alive = false;
    };
  }, [term]);
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
        if (onBack) onBack();
        else void rpc({ action: "closeLookup" });
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
        !saved?.known &&
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
          t("reviewed", {
            value1: [t("again"), t("hard"), t("good"), t("easy")][rating - 1],
          }),
        );
      } else {
        setSaved(await rpc({ action: "mine", id: word.id, term, context }));
        setNotice(t("saved"));
      }
      reload();
    } catch (error) {
      setError((error as Error).message);
      reload();
    } finally {
      setBusy(false);
    }
  }
  async function toggleMastery() {
    if (!word) return;
    setBusy(true);
    setError("");
    try {
      setSaved(
        await rpc({ action: "known", id: word.id, term, value: !saved?.known }),
      );
      setLastReview("");
      setNotice("");
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
        aria-label={t("close_dictionary")}
        onClick={() => void rpc({ action: "closeLookup" })}
      >
        <Icon name="close" />
      </button>
      <main className="lookup-content">
        <div className="lookup-body">
          {onBack && (
            <button
              className="quiet lookup-back"
              onClick={onBack}
              disabled={busy}
              aria-label={t("back_to_previous_word")}
            >
              {t("back")}{" "}
            </button>
          )}
          <ErrorBox error={error} />
          {!result && !error && <p className="muted">{t("looking_up")}</p>}
          {result && !word && (
            <Empty title={t("no_definition_found")}>
              <p>
                {result.unresolved.length
                  ? t("reference_target_unavailable", {
                      value1: result.unresolved.join(", "),
                    })
                  : t("no_enabled_dictionary_defines", { term: term })}
              </p>
              <p>{t("try_another_dictionary_or_check_for_an_update")}</p>
            </Empty>
          )}
          {word && (
            <>
              {result!.words.length > 1 && (
                <label className="candidate">
                  <select
                    aria-label={t("word")}
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
                      {t(wordStateLabels[stateOf(saved)])}
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
              <FrequencyBadge word={word} />
              {word.forms.filter((form) => !form.startsWith("redirected from "))
                .length > 0 && (
                <div className="muted small-text">
                  {[
                    ...new Set(
                      word.forms.filter(
                        (form) => !form.startsWith("redirected from "),
                      ),
                    ),
                  ]
                    .map((form) =>
                      form === "z-" ? t("czech_z_prefix_form") : form,
                    )
                    .join(" · ")}
                </div>
              )}
              <div className="lookup-reading">
                <Meanings
                  meanings={word.meanings}
                  language={word.language}
                  settings={settings}
                />
                <WordExamples word={word} settings={settings} />
              </div>
              {context && (
                <div className="lookup-sentence" data-srs-reader="">
                  <SentenceTranslation
                    key={`${context.sentence}:${context.start}`}
                    context={{
                      ...context,
                      translation:
                        context.translation ||
                        saved?.contexts.find(
                          (c) =>
                            c.sentence === context.sentence &&
                            c.start === context.start,
                        )?.translation,
                    }}
                    language={word.language}
                    settings={settings}
                    wordId={word.id}
                    label={t("translate_current_sentence")}
                    collapsed
                    onTranslated={(translation) =>
                      onContext({ ...context, translation })
                    }
                  />
                </div>
              )}
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
                <Icon name={saved?.card || saved?.known ? "check" : "plus"} />
                {saved?.card || saved?.known
                  ? t("save_example")
                  : t("mine_word")}
              </button>
              <button
                className="quiet master-action"
                aria-pressed={!!saved?.known}
                disabled={busy}
                onClick={() => void toggleMastery()}
              >
                <Icon name="check" />
                {saved?.known ? t("unmaster") : t("master")}
              </button>
            </div>
            {saved?.known ? null : saved?.suspended ? (
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
                {t("resume")}{" "}
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
                        setNotice(t("review_undone"));
                        reload();
                      })
                      .catch((error) => setError(error.message))
                  }
                >
                  {t("undo")}{" "}
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
