import { languageName } from "@/languages/codes";
import {
  Badge,
  Box,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AudioButton } from "@/audio/components/AudioButton";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { dictionaryPartsOfSpeech } from "@/dictionaries/grammar";
import { CardDefinitions } from "@/vocabulary/components/CardDefinitions";
import { ContextSentence } from "@/vocabulary/components/ContextSentence";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Ratings } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { useReviewSession } from "@/srs/hooks/useReviewSession";
import { SessionSummary } from "@/srs/components/SessionSummary";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
import { Check, Eye, Pause, Undo2 } from "lucide-react";

export function ReviewPage({
  settings,
  deckId,
}: {
  settings: Settings;
  deckId?: string;
}) {
  const {
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
  if (!queue && !error) return <SrsProgress />;
  return (
    <Stack
      mih="calc(100dvh - var(--app-shell-header-offset) - 2 * var(--app-shell-padding))"
      h={
        word
          ? "calc(100dvh - var(--app-shell-header-offset) - 2 * var(--app-shell-padding))"
          : undefined
      }
      gap="xs"
    >
      <SrsProgress />
      <Text variant="supporting" ta="center">
        {languageName(settings.studyLanguage)}
      </Text>
      <Group justify="center">
        {(
          [
            ["new", queue?.fresh],
            ["srs_queue_learning", queue?.learning],
            ["srs_queue_relearning", queue?.relearning],
            ["review", queue?.reviews],
            ["reviewed_today", queue?.today],
          ] as const
        ).map(([label, count]) => (
          <Text key={label}>
            {t(label)}{" "}
            <Text span inherit fw={700}>
              {count ?? "—"}
            </Text>
          </Text>
        ))}
      </Group>
      {!!queue?.ahead && (
        <Text variant="supporting">
          {t("srs_queue_ahead", { count: queue.ahead })}
        </Text>
      )}
      <ErrorBox error={error} />
      {word ? (
        <>
          <Paper
            ref={readingRef}
            key={`${word.id}:${word.card?.reps}`}
            flex={1}
            mih={0}
          >
            <ScrollArea
              h="100%"
              type="never"
              scrollbars="y"
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
                    wrap="nowrap"
                    justify="flex-end"
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
                    justify="center"
                    align="center"
                    ta="center"
                    display={revealed ? "none" : undefined}
                    style={{ gridArea: "1 / 1" }}
                    aria-hidden={revealed}
                    inert={revealed}
                  >
                    <Text variant="supporting" data-srs-reader>
                      {t("study_reveal_hint")}
                    </Text>
                  </Stack>
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
          <Box display="grid">
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
      {word && (
        <Group component="footer" justify="space-between" align="center">
          <Button
            variant="subtle"
            title={t("undo_last_review")}
            leftSection={<Undo2 aria-hidden="true" size={16} />}
            disabled={!last || busy}
            onClick={() => void undo()}
          >
            {t("undo")}
          </Button>
          <Group>
            <Button
              variant="subtle"
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
            </Button>
            <Button
              variant="subtle"
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
            </Button>
          </Group>
        </Group>
      )}
    </Stack>
  );
}
