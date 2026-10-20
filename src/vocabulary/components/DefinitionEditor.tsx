import type { Occurrence } from "@/languages/analysis";
import {
  Loader,
  ActionIcon,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { translateSentence } from "@/translation/translate";
import { vocabularyClient } from "@/vocabulary/client";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { Languages, Save, X } from "lucide-react";
import { useState } from "react";
export function DefinitionEditor({
  word,
  term,
  context,
  occurrence,
  settings,
  onSaved,
  onError,
  onCancel,
}: {
  word?: LookupWord;
  term: string;
  context?: ReadingContext;
  occurrence?: Occurrence;
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
      const saved = await vocabularyClient({
        action: "defineWord",
        id: word?.id,
        term,
        context,
        occurrence,
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
    <Stack data-srs-reader="" gap="xs">
      <Textarea
        rows={3}
        aria-label={t("personal_definition")}
        placeholder={t("personal_definition")}
        value={definition}
        disabled={busy}
        onChange={(event) => setDefinition(event.target.value)}
      />
      <Group gap="xs" align="center">
        <Button
          disabled={busy || !definition.trim()}
          onClick={() => void save()}
          variant="filled"
        >
          <Save aria-hidden="true" size={16} /> {t("save_definition")}
        </Button>
        <ActionIcon
          title={t("translate_word")}
          aria-label={t("translate_word")}
          disabled={busy}
          onClick={() => void translate()}
          variant="subtle"
        >
          {busy && status ? (
            <Loader size={14} aria-hidden="true" />
          ) : (
            <Languages aria-hidden="true" size={16} />
          )}
        </ActionIcon>
        {onCancel && (
          <ActionIcon
            title={t("cancel")}
            aria-label={t("cancel")}
            disabled={busy}
            onClick={onCancel}
            variant="subtle"
          >
            <X aria-hidden="true" size={16} />
          </ActionIcon>
        )}
      </Group>
      {status && (
        <Text role="status" c="dimmed" fz="xs">
          {status}
        </Text>
      )}
    </Stack>
  );
}
