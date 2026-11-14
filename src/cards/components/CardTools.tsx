import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { FilePenLine, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { CardDocument } from "@/cards/model";
import type { Settings } from "@/settings/model";
import type { ReadingContext } from "@/vocabulary/model";
import { NoteFieldsEditor } from "@/cards/components/NoteFieldsEditor";
import { AddCard } from "@/cards/components/AddCard";
import { refreshNote } from "@/cards/storage";
import { MediaField } from "@/vocabulary/components/CardEditor";
import { CardDefinitions } from "@/vocabulary/components/CardDefinitions";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { t } from "@/shared/i18n/i18n";

export function CardTools({
  document,
  settings,
  context,
  onChanged,
}: {
  document: CardDocument;
  settings: Settings;
  context?: ReadingContext;
  onChanged: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    <>
      <ActionIcon
        onClick={() => setOpened(true)}
        title={t("card_edit")}
        aria-label={t("card_edit")}
      >
        <FilePenLine aria-hidden size={16} />
      </ActionIcon>
      <Modal
        closeButtonProps={{ "aria-label": t("close") }}
        opened={opened}
        onClose={() => {
          setOpened(false);
          onChanged();
        }}
        title={t("card_edit")}
        size="lg"
      >
        {opened && (
          <Stack>
            <ErrorBox error={error} />
            <NoteFieldsEditor noteId={document.note.id} onSaved={onChanged} />
            {document.note.wordId && (
              <>
                <AddCard
                  key={document.card.id}
                  document={document}
                  onCreated={onChanged}
                />
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
                {(document.noteType.bindings.image !== undefined ||
                  document.noteType.bindings.wordAudio !== undefined ||
                  document.noteType.bindings.sentenceAudio !== undefined) && (
                  <Title order={3}>{t("card_media")}</Title>
                )}
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
                  document.noteType.bindings.sentenceAudio !== undefined && (
                    <MediaField
                      wordId={document.note.wordId}
                      noteId={document.note.id}
                      kind="audio"
                      sentence={context.sentence}
                    />
                  )}
                <CardDefinitions
                  id={document.note.wordId}
                  context={context}
                  settings={settings}
                  onError={setError}
                />
              </>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
