import { useReviewClock } from "../../src/useReviewClock";
import { SrsProgress } from "../../src/SrsProgress";
import { Select, SelectOption } from "../../src/Select";
import {
  Check,
  Plus,
  ArrowLeft,
  Play,
  Undo2,
  Pencil,
  Trash2,
} from "lucide-react";
import { t } from "../../src/i18n";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { rpc } from "../../src/api";
import {
  folded,
  stateOf,
  wordId,
  type LookupResult,
  type LookupWord,
  type ReadingContext,
  type Vocabulary,
} from "../../src/model";
import {
  AudioButton,
  ErrorBox,
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
import { DefinitionEditor } from "../../src/DefinitionEditor";

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
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<Vocabulary>();
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastReview, setLastReview] = useState("");
  const duration = useReviewClock(`${selected}:${saved?.card?.reps}`);
  const unparsed = result?.words.length === 0;
  const word: LookupWord | undefined =
    result?.words.find((w) => w.id === selected) ||
    (unparsed && settings.studyLanguage
      ? {
          id: wordId(
            settings.studyLanguage,
            folded(term.trim(), settings.studyLanguage),
            "",
          ),
          lemma: folded(term.trim(), settings.studyLanguage),
          reading: "",
          language: settings.studyLanguage,
          meanings: [],
          forms: [],
        }
      : undefined);
  const hasPersonalDefinition =
    word?.meanings.some((meaning) => meaning.dictionaryId === "personal") ||
    false;
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
        setError(lookup.warning || "");
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
      rpc({ action: "preview", id: selected, durationMs: duration() }),
      rpc({ action: "settings" }),
      rpc({ action: "lookup", term }),
    ])
      .then(([word, times, settings, result]) => {
        setSaved(word);
        setTimes(times);
        setSettings(settings);
        setResult(result);
        setError(result.warning || "");
      })
      .catch((error) => setError(error.message));
  }, [selected, term, duration]);
  useEffect(reload, [reload]);
  useChanges(reload);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        candidateOpen ||
        (event.target as HTMLElement).closest('[role="menu"]')
      )
        return;
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
        !unparsed &&
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
  async function ignoreTag(tag: string) {
    try {
      const latest = await rpc({ action: "settings" });
      setSettings(
        await rpc({
          action: "setSettings",
          value: { ...latest, ignoredTags: [...latest.ignoredTags, tag] },
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
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
          version: saved?.srsVersion ?? 0,
          durationMs: duration(),
          time: Date.now(),
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
        setNotice("");
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
  async function definitionSaved(saved: Vocabulary) {
    setResult(await rpc({ action: "lookup", term }));
    setSelected(saved.id);
    setSaved(saved);
    setEditing(false);
    setNotice("");
  }
  async function deleteDefinition() {
    if (!word || !hasPersonalDefinition || busy) return;
    setBusy(true);
    setError("");
    try {
      await rpc({ action: "deleteDefinition", id: word.id });
      setEditing(false);
      setNotice("");
      reload();
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
      <main className="lookup-content">
        <div className="lookup-body">
          {onBack && (
            <button
              className="quiet lookup-back"
              onClick={onBack}
              disabled={busy}
              title={t("back_to_previous_word")}
              aria-label={t("back_to_previous_word")}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
          )}
          <ErrorBox error={error} />
          <SrsProgress />
          {!result && !error && <p className="muted">{t("looking_up")}</p>}
          {word && (
            <>
              <div className="word-heading">
                <div>
                  <h1 lang={word.language}>
                    {folded(term, word.language) !==
                      folded(word.lemma, word.language) && (
                      <span className="surface-form">{term} → </span>
                    )}
                    {word.lemma}
                    {result!.words.length > 1 && (
                      <Select
                        iconOnly
                        value={selected}
                        open={candidateOpen}
                        onOpenChange={setCandidateOpen}
                        disabled={busy}
                        aria-label={`${t("choose_word")}: ${word.lemma}`}
                        title={t("choose_word")}
                        onValueChange={(value) => {
                          setSelected(value);
                          setNotice("");
                          setLastReview("");
                        }}
                      >
                        {result!.words.map((candidate) => (
                          <SelectOption key={candidate.id} value={candidate.id}>
                            <span lang={candidate.language}>
                              {candidate.lemma}
                            </span>
                            {candidate.reading && (
                              <small>{candidate.reading}</small>
                            )}
                          </SelectOption>
                        ))}
                      </Select>
                    )}
                  </h1>
                  {word.reading && (
                    <span className="muted">{word.reading}</span>
                  )}
                </div>
                <div className="lookup-heading-actions">
                  <FrequencyBadge word={word} />
                  {!unparsed && (
                    <button
                      className="quiet icon-button"
                      title={t("edit_definition")}
                      aria-label={t("edit_definition")}
                      disabled={busy}
                      onClick={() => setEditing((value) => !value)}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                  )}
                  {hasPersonalDefinition && (
                    <button
                      className="quiet icon-button danger"
                      title={t("delete_custom_definition")}
                      aria-label={t("delete_custom_definition")}
                      disabled={busy}
                      onClick={() => void deleteDefinition()}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  )}
                  <AudioButton
                    word={word}
                    settings={settings}
                    onError={setError}
                  />
                </div>
              </div>
              <div className="lookup-meta">
                {saved && (
                  <span
                    className={`state state-${stateOf(saved, settings.matureIntervalDays)}`}
                  >
                    {t(
                      wordStateLabels[
                        stateOf(saved, settings.matureIntervalDays)
                      ],
                    )}
                  </span>
                )}
                {context && (
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
                    compact
                    onTranslated={(translation) =>
                      onContext({ ...context, translation })
                    }
                  />
                )}
              </div>
              {(word.forms.filter(
                (form) => !form.startsWith("redirected from "),
              ).length > 0 ||
                word.meanings.some((meaning) => meaning.grammar?.length)) && (
                <div className="muted small-text">
                  {[
                    ...new Set(
                      word.forms.filter(
                        (form) => !form.startsWith("redirected from "),
                      ),
                    ),
                  ]
                    .map((form) =>
                      form === "z-"
                        ? t("czech_z_prefix_form")
                        : form === "cs-imperfective"
                          ? t("czech_imperfective_form")
                          : form,
                    )
                    .join(" · ")}
                  {word.forms.length > 0 &&
                    word.meanings.some((meaning) => meaning.grammar?.length) &&
                    " · "}
                  {word.meanings
                    .flatMap((meaning) => meaning.grammar || [])
                    .map((part, index) => (
                      <span key={index} title={part.title}>
                        {part.text}
                      </span>
                    ))}
                </div>
              )}
              <div className="lookup-reading">
                {unparsed || editing ? (
                  <DefinitionEditor
                    key={word.id}
                    word={unparsed ? undefined : word}
                    term={term}
                    context={context}
                    settings={settings}
                    onSaved={definitionSaved}
                    onError={setError}
                    onCancel={unparsed ? undefined : () => setEditing(false)}
                  />
                ) : (
                  <Meanings
                    meanings={word.meanings}
                    language={word.language}
                    settings={settings}
                    onIgnoreTag={(tag) => void ignoreTag(tag)}
                  />
                )}
                <WordExamples
                  word={word}
                  settings={settings}
                  surface={context?.surface || term}
                />
              </div>
            </>
          )}
        </div>
      </main>
      {word && !unparsed && (
        <section className="lookup-actions">
          <div className="lookup-action-row">
            <div className="row mining-actions">
              {!saved?.card && !saved?.known && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void act()}
                >
                  <Plus aria-hidden="true" /> {t("mine_word")}
                </button>
              )}
              <button
                className="quiet master-action"
                aria-pressed={!!saved?.known}
                disabled={busy}
                onClick={() => void toggleMastery()}
              >
                <Check aria-hidden="true" />
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
                <Play aria-hidden="true" /> {t("resume")}
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
                  title={t("undo")}
                  aria-label={t("undo")}
                  className="quiet icon-button"
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
                  <Undo2 aria-hidden="true" />
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
