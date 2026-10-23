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
  onError,
}: {
  id: string;
  settings: Settings;
  context?: ReadingContext;
  onError: (message: string) => void;
}) {
  const [result, setResult] = useState<Responses["cardDefinitions"]>();
  const [editing, setEditing] = useState<DefinitionEditing>(null);
  const pending = useRef(0);
  const reload = useCallback(async () => {
    const request = ++pending.current;
    try {
      const result = await vocabularyClient({
        action: "cardDefinitions",
        id,
        context,
      });
      if (request === pending.current) setResult(result);
    } catch (error) {
      if (request === pending.current) onError((error as Error).message);
    }
  }, [id, context, settings, onError]);
  useEffect(() => {
    void reload();
    return () => {
      pending.current++;
    };
  }, [reload]);
  useChanges(reload, ["vocabulary", "settings", "dictionaries"]);
  const visibility = useDictionaryVisibility(id, result?.saved, onError);
  if (!result) return <Loader size="sm" aria-label={t("looking_up")} />;
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
        term={result.occurrence ? context!.surface : result.word.lemma}
        settings={settings}
        context={context}
        occurrence={result.occurrence}
        grammar={result.grammar}
        editing={editing}
        onEditingChange={setEditing}
        onSaved={reload}
        onError={onError}
        expandedDictionaries={visibility.expandedDictionaries}
        hiddenDictionaries={visibility.hiddenDictionaries}
        onToggleDictionary={visibility.toggleDictionary}
        onToggleHiddenDictionary={visibility.toggleHiddenDictionary}
      />
    </Stack>
  );
}
