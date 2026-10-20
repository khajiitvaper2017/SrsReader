import { Loader, Button, Stack, Text } from "@mantine/core";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { translateSentence } from "@/translation/translate";
import { vocabularyClient } from "@/vocabulary/client";
import type { ReadingContext } from "@/vocabulary/model";
import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
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
}: {
  text: string;
  language: string;
  settings: Settings;
  initialTranslation?: Translation;
  onTranslated?: (translation: Translation) => void | Promise<void>;
  label?: string;
  collapsed?: boolean;
  compact?: boolean;
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
    <Stack data-srs-reader="" gap="xs">
      {shown && translation && (
        <Text lang={translation.language} dir="auto">
          {translation.text}
        </Text>
      )}
      {(!shown ||
        !translation ||
        translation.language !== settings.nativeLanguage) && (
        <Button
          title={busy ? status || t("translating") : label}
          aria-label={busy ? status || t("translating") : label}
          disabled={busy}
          onClick={() => void translate()}
          variant="subtle"
          size="compact-xs"
          w={compact ? 28 : undefined}
        >
          {busy ? (
            <Loader size={14} aria-hidden="true" />
          ) : (
            <Languages aria-hidden="true" size={16} />
          )}
          {!compact && (busy ? status || t("translating") : label)}
        </Button>
      )}
      {error && (
        <Text role="alert" c="red">
          {error}
        </Text>
      )}
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
}: {
  context: ReadingContext;
  language: string;
  settings: Settings;
  wordId?: string;
  onTranslated?: (translation: Translation) => void;
  label?: string;
  collapsed?: boolean;
  compact?: boolean;
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
    />
  );
}
