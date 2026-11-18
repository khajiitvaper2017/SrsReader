import { useCallback, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { lookupClient } from "@/lookup/client";
import { escapeHtml } from "@/cards/defaults";
import { useCardMedia } from "@/media/hooks/useCardMedia";
import { CardViewer } from "@/cards/components/CardViewer";
import { fieldText } from "@/cards/template";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import type { ReadingContext } from "@/vocabulary/model";
import { CardTools } from "@/cards/components/CardTools";
import { ChevronRight, FilePenLine, RefreshCw } from "lucide-react";
import { refreshNote } from "@/cards/storage";
import {
  Badge,
  ActionIcon,
  Box,
  Button,
  Group,
  HoverCard,
  Menu,
  Modal,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { AudioButton } from "@/audio/components/AudioButton";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import type { Settings } from "@/settings/model";
import { number, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Ratings } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { useReviewSession } from "@/srs/hooks/useReviewSession";
import { SessionProgress } from "@/srs/components/SessionProgress";
import { SessionSummary } from "@/srs/components/SessionSummary";
import { vocabularyClient } from "@/vocabulary/client";
import {
  ArrowLeft,
  Check,
  Eye,
  Pause,
  Play,
  Timer,
  Undo2,
  MoreHorizontal,
} from "lucide-react";

export function ReviewPage({
  settings,
  deckId,
}: {
  settings: Settings;
  deckId?: string;
}) {
  const {
    timer,
    readingRef,
    answers,
    studyMore,
    preload,
    queue,
    revealed,
    times,
    error,
    setError,
    busy,
    last,
    example,
    setExample,
    word,
    context,
    contexts,
    sentenceLoading,
    load,
    gradeWord,
    reveal,
    undo,
  } = useReviewSession({ settings, deckId });
  const [lookupSession, setLookupSession] = useState("");
  const [toolsNote, setToolsNote] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const displayedCard = useRef("");
  const cardReady = useCallback((id: string) => {
    if (displayedCard.current !== id && viewport.current)
      viewport.current.scrollTop = 0;
    displayedCard.current = id;
  }, []);
  const openLookup = useCallback(
    (term: string) => {
      if (!word) return;
      void lookupClient({
        action: "createSession",
        term,
        context:
          context?.surface === term
            ? { ...context, language: word.language }
            : {
                language: word.language,
                sentence: term,
                surface: term,
                start: 0,
                end: term.length,
                url: location.href,
                title: document.title,
                mined: Date.now(),
              },
      })
        .then(setLookupSession)
        .catch((error: Error) => setError(error.message));
    },
    [word?.language, context],
  );
  const sentenceAudio = useCardMedia(
    word?.wordId || "",
    "audio",
    context?.sentence || "",
    queue?.document?.note.id,
  );
  const translationContext = useMemo((): ReadingContext | undefined => {
    const document = queue?.document;
    if (!document?.noteType.id.startsWith("reader:")) return;
    if (context) return context;
    const { sentence, translation } = document.noteType.bindings;
    if (sentence === undefined) return;
    const text = fieldText(document.note.fields[sentence] || "");
    if (!text) return;
    return {
      sentence: text,
      surface: text,
      start: 0,
      end: text.length,
      url: "",
      title: "",
      mined: document.note.created,
      translation:
        translation === undefined
          ? undefined
          : {
              text: fieldText(document.note.fields[translation] || ""),
              language: settings.nativeLanguage,
            },
    };
  }, [queue?.document, context, settings.nativeLanguage]);
  const translationKey = JSON.stringify([
    word?.noteId,
    translationContext?.sentence,
    settings.nativeLanguage,
  ]);
  const [displayTranslation, setDisplayTranslation] = useState<{
    key: string;
    value?: ReadingContext["translation"];
  }>();
  const initialTranslation =
    translationContext?.customTranslations?.[settings.nativeLanguage] ??
    (translationContext?.translation?.language === settings.nativeLanguage
      ? translationContext.translation.text
      : "");
  const translationText = !settings.showSentenceTranslation
    ? ""
    : displayTranslation?.key === translationKey
      ? displayTranslation.value?.text || ""
      : settings.autoTranslateSentences ||
          translationContext?.customTranslations?.[settings.nativeLanguage]
        ? initialTranslation
        : "";
  const viewerDocument = useMemo(() => {
    if (!word || !queue!.document!.noteType.id.startsWith("reader:"))
      return queue?.document;
    const fields = [...queue!.document!.note.fields];
    const bindings = queue!.document!.noteType.bindings;
    if (context && bindings.sentence !== undefined)
      fields[bindings.sentence] = escapeHtml(context.sentence);
    if (bindings.translation !== undefined)
      fields[bindings.translation] = escapeHtml(translationText);
    if (context && bindings.sentenceAudio !== undefined)
      fields[bindings.sentenceAudio] = sentenceAudio?.media
        ? `[sound:${sentenceAudio.media.name}]`
        : "";
    return { ...queue!.document!, note: { ...queue!.document!.note, fields } };
  }, [queue?.document, context, translationText, sentenceAudio?.media]);
  const back = (
    <ActionIcon
      component="a"
      href="#review"
      title={t("study_end_session")}
      aria-label={t("study_end_session")}
    >
      <ArrowLeft aria-hidden size={16} />
    </ActionIcon>
  );
  return (
    <Stack
      data-srs-reader-review
      mih="calc(100dvh - var(--app-shell-header-offset, 0px) - 2 * var(--mantine-spacing-md))"
      h={
        word
          ? "calc(100dvh - var(--app-shell-header-offset, 0px) - 2 * var(--mantine-spacing-md))"
          : undefined
      }
      gap="xs"
    >
      <SrsProgress />
      {!word && <Group>{back}</Group>}
      {word && queue && (
        <SessionProgress queue={queue} answers={answers} back={back}>
          <Group gap={4} wrap="nowrap" justify="flex-end" align="center">
            <ActionIcon
              variant={timer.enabled ? "light" : "subtle"}
              title={t(
                timer.enabled ? "timed_review_disable" : "timed_review_enable",
              )}
              aria-label={t(
                timer.enabled ? "timed_review_disable" : "timed_review_enable",
              )}
              aria-pressed={timer.enabled}
              disabled={busy}
              onClick={timer.toggle}
            >
              <Timer aria-hidden size={16} />
            </ActionIcon>
            <Menu>
              <Menu.Target>
                <ActionIcon
                  title={t("actions")}
                  aria-label={t("actions")}
                  disabled={busy}
                >
                  <MoreHorizontal aria-hidden size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<FilePenLine aria-hidden size={16} />}
                  onClick={() => setToolsNote(queue.document!.note.id)}
                >
                  {t("card_edit")}
                </Menu.Item>
                {timer.enabled && timer.phase && (
                  <Menu.Item
                    leftSection={
                      timer.manualPaused ? (
                        <Play aria-hidden size={16} />
                      ) : (
                        <Pause aria-hidden size={16} />
                      )
                    }
                    onClick={timer.togglePause}
                  >
                    {t(
                      timer.manualPaused
                        ? "timed_review_resume"
                        : "timed_review_pause",
                    )}
                  </Menu.Item>
                )}
                {queue.document!.note.wordId &&
                  queue.document!.noteType.bindings.definitions !==
                    undefined && (
                    <Menu.Item
                      leftSection={<RefreshCw aria-hidden size={16} />}
                      onClick={() =>
                        void refreshNote(word.noteId)
                          .then(load)
                          .catch((error: Error) => setError(error.message))
                      }
                    >
                      {t("refresh_from_dictionary")}
                    </Menu.Item>
                  )}
                <Menu.Item
                  leftSection={<Check aria-hidden="true" size={16} />}
                  disabled={busy || !word.wordId}
                  onClick={() =>
                    void vocabularyClient({
                      action: "known",
                      id: word.wordId!,
                      term: word.lemma,
                      value: true,
                    })
                      .then(load)
                      .catch((error) => setError(error.message))
                  }
                >
                  {t("master")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<Pause aria-hidden="true" size={16} />}
                  disabled={busy}
                  onClick={() =>
                    void vocabularyClient({
                      action: "suspend",
                      cardId: word.id,
                      value: true,
                    })
                      .then(load)
                      .catch((error) => setError(error.message))
                  }
                >
                  {t("suspend")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </SessionProgress>
      )}
      {word && queue?.document && (
        <CardTools
          key={queue.document.note.id}
          opened={toolsNote === queue.document.note.id}
          onClose={() => setToolsNote("")}
          document={queue.document}
          settings={settings}
          context={context}
          onChanged={load}
        />
      )}
      {word && timer.enabled && settings.timedReview.showBar && (
        <HoverCard
          events={{ hover: true, focus: true, touch: false }}
          disabled={!timer.phase}
          role="tooltip"
          withArrow
        >
          <HoverCard.Target>
            <Progress
              data-srs-reader
              tabIndex={timer.phase ? 0 : undefined}
              aria-label={t("timed_review_countdown")}
              value={
                timer.phase && timer.duration
                  ? (timer.seconds / timer.duration) * 100
                  : 0
              }
              size="xs"
              color={
                timer.phase === "fail" || timer.expired ? "red" : undefined
              }
              transitionDuration={!timer.phase || timer.paused ? 0 : 1000}
            />
          </HoverCard.Target>
          <HoverCard.Dropdown>
            <Stack gap={0} align="center">
              <Text variant="supporting">
                {t(
                  timer.phase === "fail"
                    ? "timed_review_again_in"
                    : timer.phase === "question"
                      ? "timed_review_question"
                      : "timed_review_answer",
                )}
              </Text>
              <Text
                role="timer"
                aria-live="off"
                fw={600}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {number(Math.floor(timer.seconds / 60))}:
                {number(timer.seconds % 60, {
                  minimumIntegerDigits: 2,
                })}
              </Text>
              {timer.paused && (
                <Text variant="supporting">{t("timed_review_paused")}</Text>
              )}
              {timer.expired && (
                <Text role="status">{t("timed_review_expired")}</Text>
              )}
            </Stack>
          </HoverCard.Dropdown>
        </HoverCard>
      )}
      <Modal
        closeButtonProps={{ "aria-label": t("close"), size: "xl" }}
        opened={!!lookupSession}
        onClose={() => setLookupSession("")}
        title={t("dictionary_lookup")}
        size="lg"
      >
        <Box
          component="iframe"
          src={
            lookupSession
              ? `${browser.runtime.getURL("/lookup.html")}?session=${encodeURIComponent(lookupSession)}`
              : undefined
          }
          title={t("dictionary_lookup")}
          w="100%"
          h="70dvh"
          style={{ border: 0 }}
        />
      </Modal>
      <ErrorBox error={error} />
      {word ? (
        <>
          <Paper
            data-review-card
            ref={readingRef}
            p={0}
            flex={1}
            mih={0}
            pos="relative"
          >
            <ScrollArea
              viewportRef={viewport}
              h="100%"
              type="auto"
              scrollbars="y"
              offsetScrollbars="y"
              overscrollBehavior="contain"
              viewportProps={{ tabIndex: 0 }}
              styles={{ content: { minHeight: "100%" } }}
            >
              <Stack gap="xs">
                <Box
                  data-review-card-header
                  display="grid"
                  data-srs-reader
                  px="md"
                  pt="md"
                  style={{
                    gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
                    alignItems: "center",
                  }}
                >
                  <Badge style={{ gridColumn: 2 }}>
                    {t(
                      [
                        "new",
                        "srs_queue_learning",
                        "review",
                        "srs_queue_relearning",
                      ][word.card!.state]!,
                    )}
                  </Badge>
                  <Group
                    gap={4}
                    justify="flex-end"
                    miw={0}
                    style={{ gridColumn: 3 }}
                  >
                    {revealed &&
                      translationContext &&
                      settings.showSentenceTranslation && (
                        <SentenceTranslation
                          key={translationKey}
                          compact
                          context={translationContext}
                          language={word.language}
                          settings={settings}
                          autoTranslate={settings.autoTranslateSentences}
                          onDisplayChange={(value) =>
                            setDisplayTranslation({
                              key: translationKey,
                              value,
                            })
                          }
                        >
                          {(button, _translation, failure) => (
                            <>
                              {button}
                              {failure}
                            </>
                          )}
                        </SentenceTranslation>
                      )}
                    {word.wordId && (
                      <>
                        <FrequencyBadge
                          word={{ ...word, id: word.wordId, forms: [] }}
                          loadFrequencies={preload.loadFrequencies}
                        />
                        <AudioButton
                          noteId={word.noteId}
                          word={{ ...word, id: word.wordId }}
                          settings={settings}
                          onError={setError}
                          prepareRecording={preload.loadAudio}
                        />
                      </>
                    )}
                    {contexts.length > 1 && (
                      <ActionIcon
                        onClick={() =>
                          setExample((example + 1) % contexts.length)
                        }
                        title={t("another_example")}
                        aria-label={t("another_example")}
                      >
                        <ChevronRight aria-hidden size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                </Box>
                <CardViewer
                  document={viewerDocument!}
                  loadAssets={preload.loadAssets}
                  onReady={cardReady}
                  loading={
                    !!viewerDocument?.noteType.id.startsWith("reader:") &&
                    ((settings.front === "sentence" && sentenceLoading) ||
                      (revealed && !!context && !sentenceAudio))
                  }
                  revealed={revealed}
                  settings={settings}
                  onError={setError}
                  onLookup={openLookup}
                />
              </Stack>
            </ScrollArea>
          </Paper>
          <Group component="footer" wrap="nowrap" align="center" gap={4}>
            <ActionIcon
              size="input-md"
              title={t("undo_last_review")}
              aria-label={t("undo_last_review")}
              disabled={!last || busy}
              onClick={() => void undo()}
            >
              <Undo2 aria-hidden size={16} />
            </ActionIcon>
            <Box display="grid" flex={1} miw={0}>
              <Box
                style={{
                  gridArea: "1 / 1",
                  visibility: revealed ? "hidden" : "visible",
                }}
                aria-hidden={revealed}
                inert={revealed}
              >
                <Button
                  fullWidth
                  h="var(--button-height)"
                  py={0}
                  onClick={reveal}
                  disabled={busy}
                  variant="filled"
                  leftSection={<Eye aria-hidden="true" size={16} />}
                >
                  {t("show_answer")}
                </Button>
              </Box>
              <Box
                style={{
                  gridArea: "1 / 1",
                  visibility: revealed ? "visible" : "hidden",
                }}
                aria-hidden={!revealed}
                inert={!revealed}
              >
                <Ratings
                  times={times}
                  disabled={busy || !revealed}
                  onlyAgainGood={settings.onlyAgainGood}
                  onGrade={(rating) => void gradeWord(rating)}
                />
              </Box>
            </Box>
          </Group>
        </>
      ) : (
        <Stack flex={1} justify="center" align="center">
          {queue && !busy ? (
            <SessionSummary
              answers={answers}
              queue={queue}
              settings={settings}
              busy={busy}
              canUndo={!!last}
              onStudyMore={() => void studyMore()}
              onUndo={() => void undo()}
            />
          ) : (
            <SrsProgress />
          )}
        </Stack>
      )}
    </Stack>
  );
}
