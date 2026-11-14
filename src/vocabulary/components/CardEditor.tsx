import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Image,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import type { CardDocument } from "@/cards/model";
import { fieldText, getCardDocument, readingCard } from "@/cards/storage";
import { NoteFieldsEditor } from "@/cards/components/NoteFieldsEditor";
import { Images } from "lucide-react";
import type { ReadingContext, WordWithCards } from "@/vocabulary/model";
import { CardFieldsEditor } from "@/vocabulary/components/CardFieldsEditor";
import { CustomTranslationEditor } from "@/translation/components/CustomTranslationEditor";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { stopAudio } from "@/audio/playback";
import {
  backgroundTypes,
  sentenceAudioTypes,
  type CardMedia,
} from "@/media/model";
import { saveCardMedia } from "@/media/storage";
import { useCardMedia } from "@/media/hooks/useCardMedia";

export function CardEditor({
  word,
  contexts,
  nativeLanguage,
  currentSentence,
  iconOnly = false,
}: {
  word: WordWithCards;
  contexts: ReadingContext[];
  nativeLanguage: string;
  currentSentence?: string;
  /** Use an icon-only trigger in review toolbars. */
  iconOnly?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [sentence, setSentence] = useState(
    currentSentence || contexts[0]?.sentence || "",
  );
  const [loaded, setLoaded] = useState<{
    wordId: string;
    document?: CardDocument;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!opened) return;
    const subscription = liveQuery(async () => {
      const card = await readingCard(word.id);
      return {
        wordId: word.id,
        document: card ? await getCardDocument(card.id) : undefined,
      };
    }).subscribe({
      next: setLoaded,
      error: (error: Error) => setError(error.message),
    });
    return () => subscription.unsubscribe();
  }, [opened, word.id]);
  const document = loaded?.wordId === word.id ? loaded.document : undefined;
  const reader = document?.noteType.id.startsWith("reader:");
  const sentenceIndex = document?.noteType.bindings.sentence;
  const primarySentence =
    sentenceIndex === undefined
      ? ""
      : fieldText(document!.note.fields[sentenceIndex] || "");
  const selectedSentence = reader
    ? sentence || primarySentence
    : primarySentence;
  const selectedContext = contexts.find(
    (context) => context.sentence === selectedSentence,
  );
  const sentences = [
    ...new Set(
      [...contexts.map((context) => context.sentence), primarySentence].filter(
        Boolean,
      ),
    ),
  ];
  const wordId = word.id;
  const open = () => {
    stopAudio();
    setSentence(currentSentence || contexts[0]?.sentence || "");
    setLoaded(undefined);
    setError("");
    setOpened(true);
  };
  return (
    <>
      {iconOnly ? (
        <ActionIcon
          title={t("card_media")}
          aria-label={t("card_media")}
          onClick={open}
        >
          <Images aria-hidden size={16} />
        </ActionIcon>
      ) : (
        <Button
          variant="subtle"
          leftSection={<Images aria-hidden size={16} />}
          onClick={open}
        >
          {t("card_media")}
        </Button>
      )}
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={t("card_media")}
        closeButtonProps={{ "aria-label": t("close") }}
      >
        {opened && (
          <Stack>
            <ErrorBox error={error} />
            {loaded && !document && !error && (
              <Text variant="supporting">
                {t(
                  word.linkedCards.length
                    ? "select_reading_card"
                    : "card_not_found",
                )}
              </Text>
            )}
            {document && (
              <>
                <NoteFieldsEditor noteId={document.note.id} />
                {document.noteType.bindings.image !== undefined && (
                  <MediaField
                    wordId={wordId}
                    noteId={document.note.id}
                    kind="background"
                    sentence=""
                  />
                )}
                {document.noteType.bindings.wordAudio !== undefined && (
                  <MediaField
                    wordId={wordId}
                    noteId={document.note.id}
                    kind="wordAudio"
                    sentence=""
                  />
                )}
                {reader && sentences.length > 1 && (
                  <Select
                    label={t("card_media_sentence")}
                    value={selectedSentence || null}
                    allowDeselect={false}
                    onChange={(value) => setSentence(value ?? "")}
                    data={sentences}
                  />
                )}
                {selectedSentence && (
                  <Text variant="supporting">{selectedSentence}</Text>
                )}
                {reader && selectedContext && (
                  <CustomTranslationEditor
                    key={`${selectedSentence}:${nativeLanguage}`}
                    wordId={wordId}
                    context={selectedContext}
                    language={nativeLanguage}
                  />
                )}
                {document.noteType.bindings.sentenceAudio !== undefined &&
                  (selectedSentence || !reader) && (
                    <MediaField
                      key={`${document.note.id}:${selectedSentence}`}
                      wordId={wordId}
                      noteId={document.note.id}
                      kind="audio"
                      sentence={selectedSentence}
                    />
                  )}
                {reader && !selectedSentence && (
                  <Text variant="supporting">
                    {t("card_media_no_sentence")}
                  </Text>
                )}
                {reader && (
                  <CardFieldsEditor
                    key={`${document.note.id}:${document.noteType.id}`}
                    noteId={document.note.id}
                    word={{
                      ...word,
                      customFields: document.noteType.fields
                        .slice(10)
                        .map((field, index) => ({
                          name: field.label || field.name,
                          value: fieldText(
                            document.note.fields[index + 10] || "",
                            false,
                          ),
                        })),
                    }}
                  />
                )}
              </>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}

export function MediaField({
  wordId,
  kind,
  sentence,
  noteId,
}: {
  wordId: string;
  noteId?: string;
  kind: CardMedia["kind"];
  sentence: string;
}) {
  const loaded = useCardMedia(wordId, kind, sentence, noteId);
  const resetFile = useRef<() => void>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(file: File | null) {
    setBusy(true);
    setError("");
    stopAudio();
    try {
      await saveCardMedia(wordId, kind, sentence, file, noteId);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="xs">
      <Title order={3}>
        {t(
          kind === "background"
            ? "card_media_background"
            : kind === "wordAudio"
              ? "card_media_word_audio"
              : "card_media_audio",
        )}
      </Title>
      <Text variant="supporting">
        {t(
          kind === "background"
            ? "card_media_background_help"
            : kind === "wordAudio"
              ? "card_media_word_audio_help"
              : "card_media_audio_help",
        )}
      </Text>
      <ErrorBox error={error || loaded?.error || ""} />
      {loaded?.media && (
        <>
          <Text variant="supporting" style={{ overflowWrap: "anywhere" }}>
            {loaded.media.name}
          </Text>
          {kind !== "background" ? (
            <audio
              src={loaded.url}
              controls
              style={{ width: "100%" }}
              aria-label={t(
                kind === "wordAudio"
                  ? "card_media_word_audio"
                  : "card_media_audio",
              )}
              onPlay={() => stopAudio()}
              onError={() => setError(t("card_media_unavailable"))}
            />
          ) : loaded.media.mime.startsWith("video/") ? (
            <video
              src={loaded.url}
              controls
              muted
              playsInline
              style={{ width: "100%" }}
              aria-label={t("card_media_background")}
              onError={() => setError(t("card_media_unavailable"))}
            />
          ) : (
            <Image
              src={loaded.url}
              alt={t("card_media_background")}
              mah={240}
              fit="contain"
              onError={() => setError(t("card_media_unavailable"))}
            />
          )}
        </>
      )}
      <Group>
        <FileButton
          accept={(kind === "background"
            ? backgroundTypes
            : sentenceAudioTypes
          ).join(",")}
          resetRef={resetFile}
          disabled={busy || !loaded}
          onChange={(file) => {
            if (file) void save(file);
            resetFile.current?.();
          }}
        >
          {(props) => (
            <Button {...props} loading={busy}>
              {t(loaded?.media ? "card_media_replace" : "card_media_upload")}
            </Button>
          )}
        </FileButton>
        {loaded?.media && (
          <Button color="red" disabled={busy} onClick={() => void save(null)}>
            {t("card_media_remove")}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
