import {
  SegmentedControl,
  Badge,
  Box,
  Kbd,
  ActionIcon,
  Anchor,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AudioButton } from "@/audio/components/AudioButton";
import { Meanings } from "@/dictionaries/components/Meanings";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Ratings, intervalLabel } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { useReviewSession } from "@/srs/hooks/useReviewSession";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
import { Check, Eye, Pause, Undo2, Upload } from "lucide-react";

export function ReviewPage({
  settings,
  stats,
  deckId,
}: {
  settings: Settings;
  stats: { total: number; due: number; known: number; today: number };
  deckId?: string;
}) {
  const {
    queue,
    revealed,
    times,
    error,
    setError,
    busy,
    last,
    front,
    setFront,
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
  if (!queue && !error) return <SrsProgress />;
  return (
    <Stack
      h="calc(100dvh - var(--app-shell-header-offset) - 2 * var(--app-shell-padding))"
      gap="xs"
    >
      <SrsProgress />
      <Group justify="center">
        {(
          [
            ["new", queue?.fresh],
            ["srs_queue_learning", queue?.learning],
            ["srs_queue_relearning", queue?.relearning],
            ["review", queue?.reviews],
            ["reviewed_today", stats.today],
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
            key={`${word.id}:${word.card?.reps}`}
            flex={1}
            mih={0}
            style={{ overflowY: "auto" }}
          >
            <Stack h="100%">
              <Group justify="center">
                <SegmentedControl
                  fullWidth
                  w="100%"
                  maw={360}
                  value={front}
                  onChange={(value) => setFront(value as typeof front)}
                  data={[
                    { value: "word", label: t("word") },
                    { value: "sentence", label: t("in_context") },
                  ]}
                />
              </Group>
              <Stack align="center" ta="center" py="lg">
                <Badge>
                  {t(
                    [
                      "new",
                      "srs_queue_learning",
                      "review",
                      "srs_queue_relearning",
                    ][word.card!.state]!,
                  )}
                </Badge>
                {front === "sentence" && context ? (
                  <Sentence context={context} language={word.language} />
                ) : (
                  <Title lang={word.language} order={1}>
                    {word.lemma}
                  </Title>
                )}
                {word.reading && (
                  <Text variant="supporting">{word.reading}</Text>
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
                  style={{
                    gridArea: "1 / 1",
                    visibility: revealed ? "hidden" : "visible",
                  }}
                  aria-hidden={revealed}
                  inert={revealed}
                >
                  <Text variant="supporting">{t("study_reveal_hint")}</Text>
                </Stack>
                <Stack
                  style={{
                    gridArea: "1 / 1",
                    visibility: revealed ? "visible" : "hidden",
                  }}
                  aria-hidden={!revealed}
                  inert={!revealed}
                >
                  <Group justify="center">
                    <AudioButton
                      word={word}
                      settings={settings}
                      onError={setError}
                    />
                  </Group>
                  <Meanings
                    meanings={word.meanings}
                    language={word.language}
                    settings={settings}
                  />
                  {context && (
                    <Stack>
                      {settings.showSentenceTranslation ? (
                        <SentenceTranslation
                          key={`${word.id}:${example}`}
                          context={context}
                          language={word.language}
                          settings={settings}
                          wordId={word.id}
                        />
                      ) : (
                        <Sentence context={context} language={word.language} />
                      )}
                      <Group justify="space-between" align="center">
                        {context.url.startsWith("http") ? (
                          <Anchor
                            href={context.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {context.title || new URL(context.url).hostname}
                          </Anchor>
                        ) : (
                          <Text variant="supporting">
                            {context.title || t("study_cached_sentence")}
                          </Text>
                        )}
                        <AudioButton
                          word={word}
                          sentence={context.sentence}
                          settings={settings}
                          onError={setError}
                        />
                      </Group>
                      {contexts.length > 1 && (
                        <Button
                          onClick={() =>
                            setExample((example + 1) % contexts.length)
                          }
                          variant="subtle"
                        >
                          {t("example_position", {
                            current: example + 1,
                            total: contexts.length,
                          })}
                        </Button>
                      )}
                    </Stack>
                  )}
                </Stack>
              </Box>
            </Stack>
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
                rightSection={<Kbd>{t("space")}</Kbd>}
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
        <Paper flex={1}>
          <Empty
            title={stats.total ? t("no_reviews_due") : t("no_saved_words")}
          >
            {queue?.waiting && (
              <Text>
                {t("next_review_in", {
                  value1: intervalLabel(queue.waiting, settings.rolloverHour),
                })}
              </Text>
            )}
            {!stats.total && (
              <Stack>
                <Text>{t("use_your_lookup_control_on_a_word_to")}</Text>
                <Button
                  component="a"
                  href="#settings"
                  variant="filled"
                  leftSection={<Upload aria-hidden="true" size={16} />}
                >
                  {t("import_dictionary")}
                </Button>
              </Stack>
            )}
          </Empty>
        </Paper>
      )}
      <Group component="footer" justify="space-between" align="center">
        <ActionIcon
          title={t("undo_last_review")}
          aria-label={t("undo_last_review")}
          disabled={!last || busy}
          onClick={() => void undo()}
        >
          <Undo2 aria-hidden="true" size={16} />
        </ActionIcon>
        {word && (
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
              {t("suspend_word")}
            </Button>
          </Group>
        )}
      </Group>
    </Stack>
  );
}
