import { Languages } from "lucide-react";
import { t } from "./i18n";
import { useEffect, useState } from "react";
import { rpc } from "./api";
import { translateSentence } from "./browser-ai";
import type { ReadingContext, Settings } from "./model";

type Translation = NonNullable<ReadingContext["translation"]>;

export function TextTranslation({
  text,
  language,
  settings,
  initialTranslation,
  onTranslated,
  label = t("translate"),
  collapsed = false,
}: {
  text: string;
  language: string;
  settings: Settings;
  initialTranslation?: Translation;
  onTranslated?: (translation: Translation) => void | Promise<void>;
  label?: string;
  collapsed?: boolean;
}) {
  const [translation, setTranslation] = useState(initialTranslation);
  const [shown, setShown] = useState(!collapsed);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTranslation(initialTranslation);
    setError("");
  }, [text, initialTranslation]);
  async function translate() {
    if (translation?.language === settings.nativeLanguage) {
      setShown(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const value = {
        text: await translateSentence(
          text,
          language,
          settings.nativeLanguage,
          setStatus,
        ),
        language: settings.nativeLanguage,
      };
      setTranslation(value);
      setShown(true);
      await onTranslated?.(value);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  return (
    <div className="sentence-translation" data-srs-reader="">
      {shown && translation && (
        <p lang={translation.language} dir="auto">
          {translation.text}
        </p>
      )}
      {(!shown ||
        !translation ||
        translation.language !== settings.nativeLanguage) && (
        <button
          className="link"
          disabled={busy}
          onClick={() => void translate()}
        >
          <Languages aria-hidden="true" />{" "}
          {busy ? status || t("translating") : label}
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

export function SentenceTranslation({
  context,
  language,
  settings,
  wordId,
  onTranslated,
  label = t("translate_sentence"),
  collapsed = false,
}: {
  context: ReadingContext;
  language: string;
  settings: Settings;
  wordId?: string;
  onTranslated?: (translation: Translation) => void;
  label?: string;
  collapsed?: boolean;
}) {
  return (
    <TextTranslation
      key={`${context.sentence}:${context.start}:${settings.nativeLanguage}`}
      text={context.sentence}
      language={language}
      settings={settings}
      initialTranslation={context.translation}
      label={label}
      collapsed={collapsed}
      onTranslated={async (translation) => {
        onTranslated?.(translation);
        if (wordId)
          await rpc({
            action: "saveTranslation",
            id: wordId,
            sentence: context.sentence,
            start: context.start,
            translation,
          });
      }}
    />
  );
}
