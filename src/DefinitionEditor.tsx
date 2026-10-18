import { useState } from "react";
import { Languages, LoaderCircle, Save, X } from "lucide-react";
import { rpc } from "./api";
import { translateSentence } from "./browser-ai";
import { t } from "./i18n";
import type { LookupWord, ReadingContext, Settings, Vocabulary } from "./model";

export function DefinitionEditor({
  word,
  term,
  context,
  settings,
  onSaved,
  onError,
  onCancel,
}: {
  word?: LookupWord;
  term: string;
  context?: ReadingContext;
  settings: Settings;
  onSaved: (word: Vocabulary) => Promise<void>;
  onError: (message: string) => void;
  onCancel?: () => void;
}) {
  const [definition, setDefinition] = useState(
    word?.meanings
      .filter((meaning) => meaning.dictionaryId === "personal")
      .flatMap((meaning) =>
        meaning.definitions.filter((value) => typeof value === "string"),
      )
      .join("\n") || "",
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function translate() {
    setBusy(true);
    onError("");
    try {
      setDefinition(
        await translateSentence(
          word?.lemma || term,
          settings.studyLanguage,
          settings.nativeLanguage,
          setStatus,
        ),
      );
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  async function save() {
    setBusy(true);
    onError("");
    try {
      const saved = await rpc({
        action: "defineWord",
        id: word?.id,
        term,
        context,
        definition,
      });
      await onSaved(saved);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="edit-form" data-srs-reader="">
      <textarea
        rows={3}
        aria-label={t("personal_definition")}
        placeholder={t("personal_definition")}
        value={definition}
        disabled={busy}
        onChange={(event) => setDefinition(event.target.value)}
      />
      <div className="row">
        <button
          className="primary"
          disabled={busy || !definition.trim()}
          onClick={() => void save()}
        >
          <Save aria-hidden="true" /> {t("save_definition")}
        </button>
        <button
          className="quiet icon-button"
          title={t("translate_word")}
          aria-label={t("translate_word")}
          disabled={busy}
          onClick={() => void translate()}
        >
          {busy && status ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : (
            <Languages aria-hidden="true" />
          )}
        </button>
        {onCancel && (
          <button
            className="quiet icon-button"
            title={t("cancel")}
            aria-label={t("cancel")}
            disabled={busy}
            onClick={onCancel}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {status && (
        <p className="muted small-text" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
