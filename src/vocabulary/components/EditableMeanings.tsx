import { ActionIcon, Group } from "@mantine/core";
import type { LookupWord, Meaning } from "@/dictionaries/model";
import { Meanings } from "@/dictionaries/components/Meanings";
import type { Occurrence, OccurrenceGrammar } from "@/languages/analysis";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { vocabularyClient } from "@/vocabulary/client";
import { DefinitionEditor } from "@/vocabulary/components/DefinitionEditor";
import { meaningKey } from "@/vocabulary/definitions";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

export type DefinitionEditing = "add" | number | Meaning | null;

export function EditableMeanings({
  word,
  term = word.lemma,
  settings,
  context,
  occurrence,
  grammar,
  editing,
  onEditingChange,
  onSaved,
  onError,
  expandedDictionaries,
  hiddenDictionaries,
  onToggleDictionary,
  onToggleHiddenDictionary,
  onIgnoreTag,
  renderExample,
}: {
  word: LookupWord;
  term?: string;
  settings: Settings;
  context?: ReadingContext;
  occurrence?: Occurrence;
  grammar?: OccurrenceGrammar;
  editing: DefinitionEditing;
  onEditingChange: (editing: DefinitionEditing) => void;
  onSaved: (saved?: Vocabulary) => Promise<void>;
  onError: (message: string) => void;
  expandedDictionaries: string[];
  hiddenDictionaries: string[];
  onToggleDictionary: (id: string) => void;
  onToggleHiddenDictionary: (id: string) => void;
  onIgnoreTag?: (tag: string) => void;
  /** Render a matching sentence below a dictionary entry. */
  renderExample?: (meaning: Meaning) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const personalIndex = (meaning: Meaning) =>
    word.meanings
      .filter((entry) => entry.dictionaryId === "personal")
      .indexOf(meaning);
  async function remove(meaning: Meaning) {
    setBusy(true);
    onError("");
    try {
      await vocabularyClient(
        meaning.dictionaryId === "personal"
          ? {
              action: "deleteDefinition",
              id: word.id,
              definitionIndex: personalIndex(meaning),
            }
          : {
              action: "restoreDefinition",
              id: word.id,
              dictionaryKey: meaningKey(meaning),
            },
      );
      await onSaved();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const meaning =
    typeof editing === "number"
      ? word.meanings.filter((entry) => entry.dictionaryId === "personal")[
          editing
        ]
      : editing && editing !== "add"
        ? editing
        : undefined;
  return editing !== null ? (
    <DefinitionEditor
      key={meaning ? meaningKey(meaning) : "add"}
      word={word}
      term={term}
      context={context}
      occurrence={occurrence}
      grammar={grammar}
      definitionIndex={typeof editing === "number" ? editing : undefined}
      sourceMeaning={meaning?.dictionaryId !== "personal" ? meaning : undefined}
      settings={settings}
      onSaved={async (saved) => {
        await onSaved(saved);
        onEditingChange(null);
      }}
      onError={onError}
      onCancel={() => onEditingChange(null)}
    />
  ) : (
    <Meanings
      meanings={word.meanings}
      language={word.language}
      settings={settings}
      grammar={grammar}
      expandedDictionaries={expandedDictionaries}
      hiddenDictionaries={hiddenDictionaries}
      onToggleDictionary={onToggleDictionary}
      onToggleHiddenDictionary={onToggleHiddenDictionary}
      onIgnoreTag={onIgnoreTag}
      renderExample={renderExample}
      actions={(meaning) => (
        <Group gap={0} wrap="nowrap">
          <ActionIcon
            title={t("edit_definition")}
            aria-label={t("edit_definition")}
            disabled={busy}
            variant="subtle"
            onClick={() =>
              onEditingChange(
                meaning.dictionaryId === "personal"
                  ? personalIndex(meaning)
                  : meaning,
              )
            }
          >
            <Pencil aria-hidden size={16} />
          </ActionIcon>
          {(meaning.dictionaryId === "personal" ||
            meaning.customDefinitions) && (
            <ActionIcon
              title={t(
                meaning.dictionaryId === "personal"
                  ? "delete_custom_definition"
                  : "restore_dictionary_definition",
              )}
              aria-label={t(
                meaning.dictionaryId === "personal"
                  ? "delete_custom_definition"
                  : "restore_dictionary_definition",
              )}
              disabled={busy}
              variant="subtle"
              onClick={() => void remove(meaning)}
            >
              {meaning.dictionaryId === "personal" ? (
                <Trash2 aria-hidden size={16} />
              ) : (
                <RotateCcw aria-hidden size={16} />
              )}
            </ActionIcon>
          )}
        </Group>
      )}
    />
  );
}
