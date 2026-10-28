import { Button, Stack, Textarea } from "@mantine/core";
import { useState } from "react";
import { languageName } from "@/languages/codes";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { vocabularyClient } from "@/vocabulary/client";
import type { ReadingContext } from "@/vocabulary/model";

export function CustomTranslationEditor({
  wordId,
  context,
  language,
}: {
  wordId: string;
  context: ReadingContext;
  language: string;
}) {
  const [text, setText] = useState(
    context.customTranslations?.[language] || "",
  );
  const [saved, setSaved] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await vocabularyClient({
        action: "saveCustomTranslation",
        id: wordId,
        context,
        language,
        text,
      });
      setSaved(text);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="xs">
      <Textarea
        label={t("card_translation", { language: languageName(language) })}
        description={t("card_translation_help")}
        value={text}
        disabled={busy}
        maxLength={30000}
        autosize
        minRows={2}
        maxRows={8}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <ErrorBox error={error} />
      <Button
        loading={busy}
        disabled={text === saved}
        onClick={() => void save()}
      >
        {t("save")}
      </Button>
    </Stack>
  );
}
