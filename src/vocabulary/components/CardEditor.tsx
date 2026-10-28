import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Image,
  Modal,
  NativeSelect,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useRef, useState } from "react";
import { Images } from "lucide-react";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";
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
  word: Vocabulary;
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
  const selectedContext = contexts.find(
    (context) => context.sentence === sentence,
  );
  const wordId = word.id;
  const open = () => {
    stopAudio();
    setSentence(currentSentence || contexts[0]?.sentence || "");
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
            <MediaField wordId={wordId} kind="background" sentence="" />
            <MediaField wordId={wordId} kind="wordAudio" sentence="" />
            {contexts.length > 1 && (
              <NativeSelect
                label={t("card_media_sentence")}
                value={sentence}
                onChange={(event) => setSentence(event.currentTarget.value)}
                data={[
                  ...new Set(contexts.map((context) => context.sentence)),
                ].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            )}
            {sentence ? (
              <>
                <Text variant="supporting">{sentence}</Text>
                {selectedContext && (
                  <CustomTranslationEditor
                    key={`${sentence}:${nativeLanguage}`}
                    wordId={wordId}
                    context={selectedContext}
                    language={nativeLanguage}
                  />
                )}
                <MediaField
                  key={sentence}
                  wordId={wordId}
                  kind="audio"
                  sentence={sentence}
                />
              </>
            ) : (
              <Text variant="supporting">{t("card_media_no_sentence")}</Text>
            )}
            <CardFieldsEditor word={word} />
          </Stack>
        )}
      </Modal>
    </>
  );
}

function MediaField({
  wordId,
  kind,
  sentence,
}: {
  wordId: string;
  kind: CardMedia["kind"];
  sentence: string;
}) {
  const loaded = useCardMedia(wordId, kind, sentence);
  const resetFile = useRef<() => void>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(file: File | null) {
    setBusy(true);
    setError("");
    stopAudio();
    try {
      await saveCardMedia(wordId, kind, sentence, file);
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
              onPlay={stopAudio}
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
