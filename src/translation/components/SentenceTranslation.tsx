import { ActionIcon, Loader, Button, Stack, Text } from "@mantine/core";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { translateSentence } from "@/translation/translate";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
import type { ReadingContext } from "@/vocabulary/model";
import { Languages } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
type Translation = NonNullable<ReadingContext["translation"]>;
export function TextTranslation({
  text,
  language,
  settings,
  initialTranslation,
  onTranslated,
  label = t("translate"),
  collapsed = false,
  compact = false,
  renderTranslation,
  children,
}: {
  text: string | string[];
  language: string;
  settings: Settings;
  initialTranslation?: Translation;
  onTranslated?: (translation: Translation) => void | Promise<void>;
  label?: string;
  collapsed?: boolean;
  compact?: boolean;
  renderTranslation?: (parts: string[]) => ReactNode;
  children?: (
    button: ReactNode,
    translation: ReactNode,
    failure: ReactNode,
  ) => ReactNode;
}) {
  const [translation, setTranslation] = useState<
    (Translation & { parts?: string[] }) | undefined
  >(initialTranslation);
  const inputKey = JSON.stringify(text);
  const [shown, setShown] = useState(!collapsed);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const Control = compact ? ActionIcon : Button;
  useEffect(() => {
    setTranslation(initialTranslation);
    setError("");
  }, [inputKey, initialTranslation]);
  async function translate() {
    if (translation?.language === settings.nativeLanguage) {
      console.info("[translation] text cache hit", {
        text,
        sourceLanguage: language,
        targetLanguage: settings.nativeLanguage,
        response: translation.text,
      });
      setShown(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const parts: string[] = [];
      for (const part of typeof text === "string" ? [text] : text) {
        parts.push(
          await translateSentence(
            part,
            language,
            settings.nativeLanguage,
            setStatus,
          ),
        );
      }
      const value = {
        text: parts.join("\n"),
        parts,
        language: settings.nativeLanguage,
      };
      setTranslation(value);
      setShown(true);
      await onTranslated?.({ text: value.text, language: value.language });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  const showingTranslation =
    shown && translation?.language === settings.nativeLanguage;
  const translated =
    showingTranslation &&
    translation &&
    (renderTranslation ? (
      renderTranslation(translation.parts || [translation.text])
    ) : (
      <Text
        data-srs-reader=""
        lang={translation.language}
        dir="auto"
        w="100%"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {translation.text}
      </Text>
    ));
  const buttonLabel = busy
    ? status || t("translating")
    : showingTranslation
      ? t("show_original")
      : label;
  const button = (
    <Control
      title={buttonLabel}
      aria-label={buttonLabel}
      aria-pressed={showingTranslation}
      disabled={busy}
      onClick={() => (showingTranslation ? setShown(false) : void translate())}
      variant="subtle"
      size={compact ? "sm" : "compact-xs"}
      color={compact ? "gray" : undefined}
    >
      {busy ? (
        <Loader size={14} aria-hidden="true" />
      ) : (
        <Languages aria-hidden="true" size={16}>
          {showingTranslation && <path d="m3 3 18 18" />}
        </Languages>
      )}
      {!compact && buttonLabel}
    </Control>
  );
  const failure = error && (
    <Text data-srs-reader="" role="alert" c="red">
      {error}
    </Text>
  );
  if (children) return children(button, translated, failure);
  return (
    <Stack data-srs-reader="" gap="xs" align={compact ? "flex-end" : undefined}>
      {translated}
      {button}
      {failure}
    </Stack>
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
  compact = false,
  children,
}: {
  context: ReadingContext;
  language: string;
  settings: Settings;
  wordId?: string;
  onTranslated?: (translation: Translation) => void;
  label?: string;
  collapsed?: boolean;
  compact?: boolean;
  children?: (
    button: ReactNode,
    translation: ReactNode,
    failure: ReactNode,
  ) => ReactNode;
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
      compact={compact}
      onTranslated={async (translation) => {
        onTranslated?.(translation);
        if (wordId)
          await vocabularyClient({
            action: "saveTranslation",
            id: wordId,
            sentence: context.sentence,
            start: context.start,
            translation,
          });
      }}
    >
      {children ||
        ((button, translation, failure) => (
          <Stack gap="xs">
            {translation || <Sentence context={context} language={language} />}
            {button}
            {failure}
          </Stack>
        ))}
    </TextTranslation>
  );
}
