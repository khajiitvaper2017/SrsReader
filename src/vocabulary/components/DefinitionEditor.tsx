import type { Occurrence, OccurrenceGrammar } from "@/languages/analysis";
import {
  Loader,
  List,
  Badge,
  ActionIcon,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import type { LookupWord, Meaning } from "@/dictionaries/model";
import {
  definitionSenses,
  definitionText,
  mapDefinitionSenses,
} from "@/dictionaries/definitions";
import { meaningKey } from "@/vocabulary/definitions";
import { dictionaryGrammarTags } from "@/dictionaries/grammar";
import { dictionaryTags, listDictionaries } from "@/dictionaries/storage";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { translateSentence } from "@/translation/translate";
import { vocabularyClient } from "@/vocabulary/client";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { Languages, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
export function DefinitionEditor({
  word,
  term,
  context,
  occurrence,
  grammar,
  definitionIndex,
  sourceMeaning,
  settings,
  onSaved,
  onError,
  onCancel,
}: {
  word?: LookupWord;
  term: string;
  context?: ReadingContext;
  occurrence?: Occurrence;
  grammar?: OccurrenceGrammar;
  definitionIndex?: number;
  sourceMeaning?: Meaning;
  settings: Settings;
  onSaved: (word: Vocabulary) => Promise<void>;
  onError: (message: string) => void;
  onCancel?: () => void;
}) {
  const [definition, setDefinition] = useState(() => {
    const meaning =
      sourceMeaning ||
      (definitionIndex === undefined
        ? undefined
        : word?.meanings.filter(
            (meaning) => meaning.dictionaryId === "personal",
          )[definitionIndex]);
    if (meaning?.customDefinitions) return meaning.customDefinitions.join("\n");
    const senses: string[] = [];
    mapDefinitionSenses(meaning?.definitions || [], (text) => {
      senses.push(definitionText(text));
      return text;
    });
    return senses.join("\n");
  });
  const [busy, setBusy] = useState(false);
  const senses = definitionSenses(definition);
  const [status, setStatus] = useState("");
  const [tags, setTags] = useState<Pick<Meaning, "tags" | "tagDescriptions">>();
  useEffect(() => {
    let alive = true;
    setTags(undefined);
    if (sourceMeaning || !grammar) {
      const existing =
        definitionIndex === undefined
          ? undefined
          : word?.meanings.filter(
              (meaning) => meaning.dictionaryId === "personal",
            )[definitionIndex];
      setTags({
        tags: sourceMeaning?.tags || existing?.tags || "",
        tagDescriptions:
          sourceMeaning?.tagDescriptions || existing?.tagDescriptions,
      });
      return;
    }
    void listDictionaries(settings)
      .then((rows) =>
        dictionaryTags(
          rows.filter((row) => row.enabled).map((row) => row.revisionId),
        ),
      )
      .then((available) => {
        if (alive) setTags(dictionaryGrammarTags(grammar, available));
      })
      .catch((error) => {
        if (alive) onError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [grammar, settings, word, definitionIndex, sourceMeaning, onError]);
  async function translate() {
    setBusy(true);
    onError("");
    try {
      setDefinition(
        await translateSentence(
          word?.lemma || term,
          word?.language || context?.language || settings.studyLanguage,
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
        language: word?.language || context?.language || settings.studyLanguage,
        id: word?.id,
        term,
        context,
        occurrence,
        definition,
        definitionIndex,
        dictionaryKey: sourceMeaning ? meaningKey(sourceMeaning) : undefined,
      });
      await onSaved(saved);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack data-srs-reader="">
      {sourceMeaning && (
        <Text variant="supporting">{t("custom_definition_override_help")}</Text>
      )}
      <Group role="group" aria-label={t("definition_tags")}>
        <Text variant="supporting">{t("definition_tags")}</Text>
        {tags &&
          (tags.tags ? (
            tags.tags.split(/\s+/u).map((tag) => (
              <Badge key={tag} title={tags.tagDescriptions?.[tag]}>
                {tag}
              </Badge>
            ))
          ) : (
            <Text variant="supporting">{t("no_definition_tags")}</Text>
          ))}
      </Group>
      <Textarea
        rows={3}
        description={t("definition_senses_hint")}
        aria-label={t("personal_definition")}
        placeholder={t("personal_definition")}
        value={definition}
        disabled={busy}
        onChange={(event) => setDefinition(event.target.value)}
      />
      {senses.length > 0 && (
        <Stack>
          <Text variant="supporting">{t("definition_preview")}</Text>
          <List type="ordered" withPadding>
            {senses.map((sense, index) => (
              <List.Item key={index}>{sense}</List.Item>
            ))}
          </List>
        </Stack>
      )}
      <Group align="center">
        <Button
          disabled={busy || !tags || !definition.trim()}
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
        <Text variant="supporting" role="status">
          {status}
        </Text>
      )}
    </Stack>
  );
}
