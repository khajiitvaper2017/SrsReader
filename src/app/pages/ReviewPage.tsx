import { AudioButton } from "@/audio/components/AudioButton";
import { Meanings } from "@/dictionaries/components/Meanings";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Ratings, intervalLabel } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { useReviewSession } from "@/srs/hooks/useReviewSession";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
import { Check, Eye, Pause, Undo2, Upload } from "lucide-react";

export function ReviewPage({
  settings,
  stats,
}: {
  settings: Settings;
  stats: { total: number; due: number; known: number; today: number };
}) {
  const {
    queue,
    revealed,
    times,
    error,
    setError,
    busy,
    last,
    front,
    setFront,
    example,
    setExample,
    word,
    context,
    load,
    gradeWord,
    reveal,
    undo,
  } = useReviewSession({ settings, stats });

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
                  void vocabularyClient({
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
                  void vocabularyClient({
                    action: "suspend",
                    id: word.id,
                    value: true,
                  })
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
