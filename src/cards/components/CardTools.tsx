import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { CardDocument } from "@/cards/model";
import type { Settings } from "@/settings/model";
import type { ReadingContext } from "@/vocabulary/model";
import { NoteFieldsEditor } from "@/cards/components/NoteFieldsEditor";
import { refreshNote } from "@/cards/storage";
import { MediaField } from "@/vocabulary/components/CardEditor";
import { CardDefinitions } from "@/vocabulary/components/CardDefinitions";
import type { DefinitionEditing } from "@/vocabulary/components/EditableMeanings";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { t } from "@/shared/i18n/i18n";

export function CardTools({
  opened,
  onClose,
  document,
  settings,
  context,
  onChanged,
}: {
  opened: boolean;
  onClose: () => void;
  document: CardDocument;
  settings: Settings;
  context?: ReadingContext;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [definitionEditing, setDefinitionEditing] =
    useState<DefinitionEditing>(null);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await refreshNote(document.note.id);
      onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      closeButtonProps={{ "aria-label": t("close"), size: "xl" }}
      opened={opened}
      onClose={() => {
        onClose();
        setDefinitionEditing(null);
        onChanged();
      }}
      title={t("card_edit")}
      size="lg"
    >
      {opened && (
        <Stack>
          <ErrorBox error={error} />
          <Tabs
            defaultValue="fields"
            keepMounted
            keepMountedMode="display-none"
          >
            <Tabs.List>
              <Tabs.Tab value="fields">{t("card_fields_tab")}</Tabs.Tab>
              {document.note.wordId && (
                <>
                  <Tabs.Tab value="media">{t("card_media_tab")}</Tabs.Tab>
                  <Tabs.Tab value="dictionary">
                    {t("card_dictionary_tab")}
                  </Tabs.Tab>
                </>
              )}
            </Tabs.List>
            <Tabs.Panel value="fields" pt="md">
              <NoteFieldsEditor noteId={document.note.id} onSaved={onChanged} />
            </Tabs.Panel>
            {document.note.wordId && (
              <>
                <Tabs.Panel value="media" pt="md">
                  <Stack>
                    {document.noteType.bindings.image !== undefined && (
                      <MediaField
                        wordId={document.note.wordId}
                        noteId={document.note.id}
                        kind="background"
                        sentence=""
                      />
                    )}
                    {document.noteType.bindings.wordAudio !== undefined && (
                      <MediaField
                        wordId={document.note.wordId}
                        noteId={document.note.id}
                        kind="wordAudio"
                        sentence=""
                      />
                    )}
                    {context &&
                      document.noteType.bindings.sentenceAudio !==
                        undefined && (
                        <MediaField
                          wordId={document.note.wordId}
                          noteId={document.note.id}
                          kind="audio"
                          sentence={context.sentence}
                        />
                      )}
                  </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="dictionary" pt="md">
                  {document.noteType.bindings.definitions !== undefined && (
                    <Stack gap="xs">
                      <Text variant="supporting">
                        {t("card_dictionary_refresh_help")}
                      </Text>
                      <Group>
                        <Button
                          disabled={busy}
                          loading={busy}
                          leftSection={<RefreshCw aria-hidden size={16} />}
                          onClick={() => void refresh()}
                        >
                          {t("refresh_from_dictionary")}
                        </Button>
                      </Group>
                    </Stack>
                  )}
                  <Group justify="flex-end">
                    <ActionIcon
                      title={t("add_custom_definition")}
                      aria-label={t("add_custom_definition")}
                      variant="subtle"
                      onClick={() => setDefinitionEditing("add")}
                    >
                      <Plus aria-hidden size={16} />
                    </ActionIcon>
                  </Group>
                  <CardDefinitions
                    id={document.note.wordId}
                    context={context}
                    settings={settings}
                    onError={setError}
                    editing={definitionEditing}
                    onEditingChange={setDefinitionEditing}
                  />
                </Tabs.Panel>
              </>
            )}
          </Tabs>
        </Stack>
      )}
    </Modal>
  );
}
