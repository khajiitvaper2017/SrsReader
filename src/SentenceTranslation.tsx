import { useEffect, useState } from "react";
import { rpc } from "./api";
import { translateSentence } from "./browser-ai";
import type { ReadingContext, Settings } from "./model";

export function SentenceTranslation({
  context,
  language,
  settings,
  wordId,
  onTranslated,
}: {
  context: ReadingContext;
  language: string;
  settings: Settings;
  wordId: string;
  onTranslated?: (
    translation: NonNullable<ReadingContext["translation"]>,
  ) => void;
}) {
  const [translation, setTranslation] = useState(context.translation);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTranslation(context.translation);
    setError("");
  }, [context.sentence, context.start, context.translation]);
  async function translate() {
    setBusy(true);
    setError("");
    try {
      const value = {
        text: await translateSentence(
          context.sentence,
          language,
          settings.translationLanguage,
          setStatus,
        ),
        language: settings.translationLanguage,
      };
      onTranslated?.(value);
      setTranslation(value);
      await rpc({
        action: "saveTranslation",
        id: wordId,
        sentence: context.sentence,
        start: context.start,
        translation: value,
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  return (
    <div className="sentence-translation" data-srs-reader="">
      {translation && <p lang={translation.language}>{translation.text}</p>}
      {(!translation ||
        translation.language !== settings.translationLanguage) && (
        <button
          className="link"
          disabled={busy}
          onClick={() => void translate()}
        >
          {busy ? status || "Translating…" : "Translate sentence"}
        </button>
      )}
      {error && (
        <p className="translation-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
