import { AudioButton } from "@/audio/components/AudioButton";
import { Meanings } from "@/dictionaries/components/Meanings";
import { shortDefinition } from "@/dictionaries/definitions";
import { WordExamples } from "@/examples/components/WordExamples";
import type { Settings } from "@/settings/model";
import { i18n, number, t } from "@/shared/i18n/i18n";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { Sentence } from "@/vocabulary/components/Sentence";
import { useWords } from "@/vocabulary/hooks/useWords";
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
export function WordDetails({
  settings,
  controller,
}: {
  settings: Settings;
  controller: ReturnType<typeof useWords>;
}) {
  const {
    setSelected,
    setError,
    editing,
    setEditing,
    definition,
    setDefinition,
    detailRef,
    word,
    saveDefinition,
    editSentence,
    changeRetention,
    refreshWord,
    toggleMastery,
    toggleSuspension,
    deleteWord,
  } = controller;
  if (!word) return null;
  return (
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
        <AudioButton word={word} settings={settings} onError={setError} />
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
            {t("saving_replaces_the_dictionary_snapshot_for_this_card")}{" "}
          </p>
          <div className="row">
            <button
              className="primary"
              disabled={!definition.trim()}
              onClick={() => saveDefinition()}
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
              onClick={() => editSentence(context, i)}
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
          onChange={(event) => changeRetention(event)}
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
            {new Date(word.card.due).toLocaleString(i18n.resolvedLanguage)}
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
          onClick={() => refreshWord()}
        >
          <RefreshCw aria-hidden="true" />
        </button>
        <button
          className="quiet master-action"
          aria-pressed={word.known}
          onClick={() => toggleMastery()}
        >
          <Check aria-hidden="true" />
          {word.known ? t("unmaster") : t("master")}
        </button>
        {!word.known && (
          <button className="quiet" onClick={() => toggleSuspension()}>
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
          onClick={() => deleteWord()}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
