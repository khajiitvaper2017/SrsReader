import { AudioButton } from "@/audio/components/AudioButton";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { Meanings } from "@/dictionaries/components/Meanings";
import { WordExamples } from "@/examples/components/WordExamples";
import { folded } from "@/languages/text";
import { useLookupNavigation } from "@/lookup/hooks/useLookupNavigation";
import { useLookupWord } from "@/lookup/hooks/useLookupWord";
import type { LookupPage } from "@/lookup/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Select, SelectOption } from "@/shared/ui/Select";
import { srsClient } from "@/srs/client";
import { Ratings } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { vocabularyClient } from "@/vocabulary/client";
import { DefinitionEditor } from "@/vocabulary/components/DefinitionEditor";
import { stateOf, type ReadingContext } from "@/vocabulary/model";
import { wordStateLabels } from "@/vocabulary/state";
import {
  ArrowLeft,
  Check,
  Pencil,
  Play,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";

export function Lookup() {
  const { pages, setPages, error } = useLookupNavigation();
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
  const {
    settings,
    result,
    term,
    context,
    selected,
    setSelected,
    candidateOpen,
    setCandidateOpen,
    editing,
    setEditing,
    saved,
    times,
    error,
    setError,
    busy,
    notice,
    setNotice,
    lastReview,
    setLastReview,
    unparsed,
    word,
    hasPersonalDefinition,
    reload,
    ignoreTag,
    act,
    toggleMastery,
    definitionSaved,
    deleteDefinition,
  } = useLookupWord({ page, onLookup, onBack, onContext });

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
                  void vocabularyClient({
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
                    void srsClient({ action: "undo", id: lastReview })
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
