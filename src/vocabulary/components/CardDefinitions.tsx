import { ActionIcon, Group, Loader, Stack } from "@mantine/core";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { vocabularyClient } from "@/vocabulary/client";
import type { Responses } from "@/vocabulary/contracts";
import {
  EditableMeanings,
  type DefinitionEditing,
} from "@/vocabulary/components/EditableMeanings";
import { useDictionaryVisibility } from "@/vocabulary/hooks/useDictionaryVisibility";
import type { ReadingContext } from "@/vocabulary/model";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function CardDefinitions({
  id,
  settings,
  context,
  contextLoading = false,
  loadDefinitions,
  onError,
}: {
  id: string;
  settings: Settings;
  context?: ReadingContext;
  /** Wait for sentence selection before looking up definitions. */
  contextLoading?: boolean;
  /** Reuse review preparation; refresh bypasses an existing prepared result. */
  loadDefinitions?: (
    id: string,
    context?: ReadingContext,
    refresh?: boolean,
  ) => Promise<Responses["cardDefinitions"]>;
  onError: (message: string) => void;
}) {
  const [loaded, setLoaded] = useState<{
    context?: ReadingContext;
    result: Responses["cardDefinitions"];
  }>();
  const [editing, setEditing] = useState<DefinitionEditing>(null);
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
  if (!loaded) return <Loader size="sm" aria-label={t("looking_up")} />;
  const { result, context: definitionContext } = loaded;
  return (
    <Stack gap="xs">
      <Group justify="flex-end" data-srs-reader>
        <ActionIcon
          title={t("add_custom_definition")}
          aria-label={t("add_custom_definition")}
          variant="subtle"
          onClick={() => setEditing("add")}
        >
          <Plus aria-hidden size={16} />
        </ActionIcon>
      </Group>
      <EditableMeanings
        word={result.word}
        term={
          result.occurrence ? definitionContext!.surface : result.word.lemma
        }
        settings={settings}
        context={definitionContext}
        occurrence={result.occurrence}
        grammar={result.grammar}
        editing={editing}
        onEditingChange={setEditing}
        onSaved={() => reload(true)}
        onError={onError}
        expandedDictionaries={visibility.expandedDictionaries}
        hiddenDictionaries={visibility.hiddenDictionaries}
        onToggleDictionary={visibility.toggleDictionary}
        onToggleHiddenDictionary={visibility.toggleHiddenDictionary}
      />
    </Stack>
  );
}
