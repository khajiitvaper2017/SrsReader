import { ActionIcon, Loader, Button, Stack, Text } from "@mantine/core";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { canAutoTranslate, translateSentence } from "@/translation/translate";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
import type { ReadingContext } from "@/vocabulary/model";
import { Languages } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Translation = NonNullable<ReadingContext["translation"]>;
type TranslationOperation =
  | { kind: "idle" }
  | { kind: "translating"; status: string }
  | { kind: "error"; message: string };
export function TextTranslation({
  text,
  language,
  settings,
  autoTranslate,
  initialTranslation,
  onTranslated,
  onDisplayChange,
  label = t("translate"),
  collapsed = false,
  compact = false,
  renderTranslation,
  children,
}: {
  text: string | string[];
  language: string;
  settings: Settings;
  autoTranslate: boolean;
  initialTranslation?: Translation;
  onTranslated?: (translation: Translation) => void | Promise<void>;
  onDisplayChange?: (translation: Translation | undefined) => void;
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
  const translationRef = useRef(translation);
  const inputKey = JSON.stringify(text);
  const [shown, setShown] = useState(autoTranslate && !collapsed);
  const [operation, setOperation] = useState<TranslationOperation>({
    kind: "idle",
  });
  const activeRequest = useRef<object | null>(null);
  const inputGeneration = useRef(0);
  const busy = operation.kind === "translating";
  const Control = compact ? ActionIcon : Button;
  useLayoutEffect(() => {
    inputGeneration.current++;
    activeRequest.current = null;
    translationRef.current = initialTranslation;
    setTranslation(initialTranslation);
    setOperation({ kind: "idle" });
    return () => {
      inputGeneration.current++;
      activeRequest.current = null;
    };
  }, [inputKey, language, settings.nativeLanguage, initialTranslation]);
  useEffect(() => {
    setShown(autoTranslate && !collapsed);
  }, [inputKey, autoTranslate, collapsed]);
  async function translate() {
    setShown(true);
    const cached = translationRef.current;
    if (cached?.language === settings.nativeLanguage) {
      console.info("[translation] text cache hit", {
        text,
        sourceLanguage: language,
        targetLanguage: settings.nativeLanguage,
        response: cached.text,
      });
      return;
    }
    if (activeRequest.current) return;
    const request = {};
    activeRequest.current = request;
    const ownsRequest = () => activeRequest.current === request;
    setOperation({ kind: "translating", status: "" });
    try {
      const parts: string[] = [];
      for (const part of typeof text === "string" ? [text] : text) {
        const translatedPart = await translateSentence(
          part,
          language,
          settings.nativeLanguage,
          (status) => {
            if (ownsRequest()) setOperation({ kind: "translating", status });
          },
        );
        if (!ownsRequest()) return;
        parts.push(translatedPart);
      }
      const value = {
        text: parts.join("\n"),
        parts,
        language: settings.nativeLanguage,
      };
      if (!ownsRequest()) return;
      translationRef.current = value;
      setTranslation(value);
      await onTranslated?.({ text: value.text, language: value.language });
    } catch (error) {
      if (ownsRequest())
        setOperation({ kind: "error", message: (error as Error).message });
    } finally {
      if (ownsRequest()) {
        activeRequest.current = null;
        setOperation((current) =>
          current.kind === "translating" ? { kind: "idle" } : current,
        );
      }
    }
  }
  const translateAutomatically = useEffectEvent(() => {
    if (!activeRequest.current) void translate();
  });
  useEffect(() => {
    if (!autoTranslate) return;
    const generation = inputGeneration.current;
    let cancelled = false;
    void (async () => {
      if (
        initialTranslation?.language === settings.nativeLanguage ||
        (await canAutoTranslate(language, settings.nativeLanguage))
      ) {
        if (!cancelled && inputGeneration.current === generation)
          translateAutomatically();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    inputKey,
    language,
    settings.nativeLanguage,
    autoTranslate,
    initialTranslation,
  ]);
  const showingTranslation =
    shown && translation?.language === settings.nativeLanguage;
  const displayChanged = useEffectEvent(() =>
    onDisplayChange?.(showingTranslation ? translation : undefined),
  );
  useEffect(() => displayChanged(), [showingTranslation, translation]);
  const translated =
    showingTranslation &&
    translation &&
    (renderTranslation ? (
      renderTranslation(translation.parts || [translation.text])
    ) : (
      <Text
        inherit
        data-srs-reader=""
        lang={translation.language}
        dir="auto"
        w="100%"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {translation.text}
      </Text>
    ));
  const buttonLabel =
    operation.kind === "translating"
      ? operation.status || t("translating")
      : showingTranslation
        ? t("show_original")
        : label;
  const button = (
    <Control
      title={buttonLabel}
      aria-label={buttonLabel}
      aria-pressed={showingTranslation}
      aria-busy={busy}
      disabled={busy}
      onClick={() => (showingTranslation ? setShown(false) : void translate())}
      variant="subtle"
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
  const failure = operation.kind === "error" && (
    <Text data-srs-reader="" role="alert" c="red">
      {operation.message}
    </Text>
  );
  if (children) return children(button, translated, failure);
  return (
    <Stack data-srs-reader="" align={compact ? "flex-end" : undefined}>
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
  autoTranslate = settings.autoTranslateSentences,
  wordId,
  onTranslated,
  onDisplayChange,
  label = t("translate_sentence"),
  collapsed = false,
  compact = false,
  children,
}: {
  context: ReadingContext;
  language: string;
  settings: Settings;
  autoTranslate?: boolean;
  wordId?: string;
  onTranslated?: (translation: Translation) => void;
  onDisplayChange?: (translation: Translation | undefined) => void;
  label?: string;
  collapsed?: boolean;
  compact?: boolean;
  children?: (
    button: ReactNode,
    translation: ReactNode,
    failure: ReactNode,
  ) => ReactNode;
}) {
  const custom = context.customTranslations?.[settings.nativeLanguage];
  const initialTranslation = useMemo(
    () =>
      custom
        ? { text: custom, language: settings.nativeLanguage }
        : context.translation,
    [custom, context.translation, settings.nativeLanguage],
  );
  return (
    <TextTranslation
      key={`${context.sentence}:${context.start}:${settings.nativeLanguage}`}
      text={context.sentence}
      language={language}
      settings={settings}
      autoTranslate={autoTranslate || !!custom}
      initialTranslation={initialTranslation}
      label={label}
      collapsed={collapsed}
      compact={compact}
      onDisplayChange={onDisplayChange}
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
          <Stack>
            {translation || <Sentence context={context} language={language} />}
            {button}
            {failure}
          </Stack>
        ))}
    </TextTranslation>
  );
}
