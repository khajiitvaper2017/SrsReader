import {
  Badge,
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { CardBackground } from "@/media/components/CardBackground";
import { CardEditor } from "@/vocabulary/components/CardEditor";
import { CardFields } from "@/vocabulary/components/CardFields";
import { AudioButton } from "@/audio/components/AudioButton";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { dictionaryPartsOfSpeech } from "@/dictionaries/grammar";
import { CardDefinitions } from "@/vocabulary/components/CardDefinitions";
import { ContextSentence } from "@/vocabulary/components/ContextSentence";
import type { Settings } from "@/settings/model";
import { number, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Ratings } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { useReviewSession } from "@/srs/hooks/useReviewSession";
import { SessionProgress } from "@/srs/components/SessionProgress";
import { SessionSummary } from "@/srs/components/SessionSummary";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
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
  const front = settings.front;
  const partsOfSpeech =
    word && settings.showPartOfSpeech
      ? dictionaryPartsOfSpeech(word.meanings)
      : [];
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
      mih="calc(100dvh - var(--app-shell-header-offset) - 2 * var(--app-shell-padding))"
      h={
        word
          ? "calc(100dvh - var(--app-shell-header-offset) - 2 * var(--app-shell-padding))"
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
            {timer.enabled && timer.phase && (
              <ActionIcon
                variant="subtle"
                disabled={busy}
                title={t(
                  timer.manualPaused
                    ? "timed_review_resume"
                    : "timed_review_pause",
                )}
                aria-label={t(
                  timer.manualPaused
                    ? "timed_review_resume"
                    : "timed_review_pause",
                )}
                aria-pressed={timer.manualPaused}
                onClick={timer.togglePause}
              >
                {timer.manualPaused ? (
                  <Play aria-hidden size={16} />
                ) : (
                  <Pause aria-hidden size={16} />
                )}
              </ActionIcon>
            )}
            <CardEditor
              iconOnly
              key={word.id}
              word={word}
              contexts={contexts}
              nativeLanguage={settings.nativeLanguage}
              currentSentence={context?.sentence}
            />
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
                  leftSection={<Check aria-hidden="true" size={16} />}
                  disabled={busy}
                  onClick={() =>
                    void vocabularyClient({
                      action: "known",
                      id: word.id,
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
                      id: word.id,
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
      {word && timer.enabled && timer.phase && (
        <Stack gap="xs" data-srs-reader>
          <Group justify="center" gap="xs">
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
          </Group>
          {settings.timedReview.showBar && (
            <Progress
              aria-label={t("timed_review_countdown")}
              value={
                timer.duration ? (timer.seconds / timer.duration) * 100 : 0
              }
              size="xs"
              color={
                timer.phase === "fail" || timer.expired ? "red" : undefined
              }
              transitionDuration={timer.paused ? 0 : 1000}
            />
          )}
        </Stack>
      )}
      <ErrorBox error={error} />
      {word ? (
        <>
          <Paper
            ref={readingRef}
            key={`${word.id}:${word.card?.reps}`}
            flex={1}
            mih={0}
            pos="relative"
            style={{ isolation: "isolate" }}
          >
            <CardBackground wordId={word.id} onError={setError} />
            <ScrollArea
              pos="relative"
              h="100%"
              type="auto"
              scrollbars="y"
              offsetScrollbars="present"
              overscrollBehavior="contain"
              viewportProps={{ tabIndex: 0 }}
              styles={{ content: { display: "flex", minHeight: "100%" } }}
            >
              <Stack flex={1} miw={0} gap="xs">
                <Box
                  data-srs-reader
                  display="grid"
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
                    gap="xs"
                    justify="flex-end"
                    miw={0}
                    style={{
                      gridColumn: 3,
                      visibility: revealed ? "visible" : "hidden",
                    }}
                    aria-hidden={!revealed}
                    inert={!revealed}
                  >
                    <FrequencyBadge
                      word={{ ...word, forms: [] }}
                      loadFrequencies={preload.loadFrequencies}
                    />
                    <AudioButton
                      word={word}
                      settings={settings}
                      onError={setError}
                      prepareRecording={preload.loadAudio}
                    />
                  </Group>
                </Box>
                <Stack align="center" ta="center" py="xs" gap="xs">
                  {front === "sentence" && context ? (
                    <Sentence context={context} language={word.language} />
                  ) : (
                    <Title
                      lang={word.language}
                      order={1}
                      data-srs-reader-no-color
                    >
                      {word.lemma}
                    </Title>
                  )}
                  {word.reading && (
                    <Text variant="supporting" data-srs-reader>
                      {word.reading}
                    </Text>
                  )}
                  {partsOfSpeech.length > 0 && (
                    <Text variant="supporting" data-srs-reader>
                      {partsOfSpeech.join(" / ")}
                    </Text>
                  )}
                  {front === "sentence" && !context && (
                    <Text variant="supporting">
                      {t(
                        sentenceLoading
                          ? "study_sentence_loading"
                          : "study_no_cached_sentence",
                      )}
                    </Text>
                  )}
                </Stack>
                <Box display="grid" flex={1}>
                  <Stack
                    gap="xs"
                    display={revealed ? undefined : "none"}
                    style={{ gridArea: "1 / 1" }}
                    aria-hidden={!revealed}
                    inert={!revealed}
                  >
                    {front === "sentence" && (
                      <Title
                        order={2}
                        lang={word.language}
                        ta="center"
                        data-srs-reader-no-color
                      >
                        {word.lemma}
                      </Title>
                    )}
                    {context && (
                      <ContextSentence
                        variant="review"
                        saveTranslation={false}
                        key={`${word.id}:${example}`}
                        word={word}
                        context={context}
                        settings={settings}
                        onError={setError}
                        position={
                          contexts.length > 1
                            ? t("example_position", {
                                current: example + 1,
                                total: contexts.length,
                              })
                            : undefined
                        }
                        onNext={
                          contexts.length > 1
                            ? () => setExample((example + 1) % contexts.length)
                            : undefined
                        }
                      />
                    )}
                    <CardFields fields={word.customFields} />
                    <CardDefinitions
                      saveTranslation={false}
                      key={word.id}
                      id={word.id}
                      context={context}
                      contextLoading={sentenceLoading}
                      examples={contexts}
                      loadDefinitions={preload.loadDefinitions}
                      settings={settings}
                      onError={setError}
                    />
                  </Stack>
                </Box>
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
