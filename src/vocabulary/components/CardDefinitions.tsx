import { Box } from "@mantine/core";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { vocabularyClient } from "@/vocabulary/client";
import type { Responses } from "@/vocabulary/contracts";
import {
  EditableMeanings,
  type DefinitionEditing,
} from "@/vocabulary/components/EditableMeanings";
import { useDictionaryVisibility } from "@/vocabulary/hooks/useDictionaryVisibility";
import type { ReadingContext } from "@/vocabulary/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { meaningsMatchPartOfSpeech } from "@/dictionaries/grammar";
import type { SentenceExample } from "@/examples/model";
import { ContextSentence } from "@/vocabulary/components/ContextSentence";

export function CardDefinitions({
  id,
  settings,
  context,
  contextLoading = false,
  examples = [],
  loadDefinitions,
  saveTranslation = true,
  onError,
  editing,
  onEditingChange,
}: {
  id: string;
  settings: Settings;
  context?: ReadingContext;
  /** Wait for sentence selection before looking up definitions. */
  contextLoading?: boolean;
  /** Parsed examples supply a sentence for entries with another part of speech. */
  examples?: SentenceExample[];
  /** Save example translations with cached sentences; disable during reviews. */
  saveTranslation?: boolean;
  /** Reuse review preparation; refresh bypasses an existing prepared result. */
  loadDefinitions?: (
    id: string,
    context?: ReadingContext,
    refresh?: boolean,
  ) => Promise<Responses["cardDefinitions"]>;
  onError: (message: string) => void;
  editing: DefinitionEditing;
  onEditingChange: (editing: DefinitionEditing) => void;
}) {
  const [loaded, setLoaded] = useState<{
    context?: ReadingContext;
    result: Responses["cardDefinitions"];
  }>();
  const pending = useRef(0);
  const reload = useCallback(
    async (refresh = false) => {
      if (contextLoading) return;
      const request = ++pending.current;
      try {
        const result = await (loadDefinitions
          ? loadDefinitions(id, context, refresh)
          : vocabularyClient({ action: "cardDefinitions", id, context }));
        if (request === pending.current) setLoaded({ context, result });
      } catch (error) {
        if (request === pending.current) onError((error as Error).message);
      }
    },
    [id, context, contextLoading, settings, onError, loadDefinitions],
  );
  useEffect(() => {
    void reload();
    return () => {
      pending.current++;
    };
  }, [reload]);
  useChanges(
    useCallback(() => void reload(true), [reload]),
    ["vocabulary", "settings", "dictionaries"],
  );
  const visibility = useDictionaryVisibility(id, loaded?.result.saved, onError);
  if (!loaded) return <Box aria-busy data-review-timer-pause />;
  const { result, context: definitionContext } = loaded;
  return (
    <EditableMeanings
      word={result.word}
      term={result.occurrence ? definitionContext!.surface : result.word.lemma}
      settings={settings}
      context={definitionContext}
      occurrence={result.occurrence}
      grammar={result.grammar}
      editing={editing}
      onEditingChange={onEditingChange}
      onSaved={() => reload(true)}
      onError={onError}
      expandedDictionaries={visibility.expandedDictionaries}
      hiddenDictionaries={visibility.hiddenDictionaries}
      onToggleDictionary={visibility.toggleDictionary}
      onToggleHiddenDictionary={visibility.toggleHiddenDictionary}
      renderExample={(meaning) => {
        if (
          meaningsMatchPartOfSpeech(
            [meaning],
            result.grammar,
            result.word.forms,
          )
        )
          return null;
        const example = examples.find(
          (example) =>
            example.grammar &&
            meaningsMatchPartOfSpeech([meaning], example.grammar),
        );
        return example ? (
          <ContextSentence
            saveTranslation={saveTranslation}
            word={result.word}
            context={example}
            settings={settings}
            onError={onError}
          />
        ) : null;
      }}
    />
  );
}
