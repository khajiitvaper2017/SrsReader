import { languageName } from "@/languages/codes";
import {
  SegmentedControl,
  Badge,
  Box,
  Kbd,
  ActionIcon,
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
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Ratings, intervalLabel } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { useReviewSession } from "@/srs/hooks/useReviewSession";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
import { Check, Eye, Pause, Undo2, Upload } from "lucide-react";

export function ReviewPage({
  settings,
  deckId,
}: {
  settings: Settings;
  deckId?: string;
}) {
  const {
    preload,
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
  const partsOfSpeech =
    word && settings.showPartOfSpeech
      ? dictionaryPartsOfSpeech(word.meanings)
      : [];
  if (!queue && !error) return <SrsProgress />;
  return (
    <Stack
      h="calc(100dvh - var(--app-shell-header-offset) - 2 * var(--app-shell-padding))"
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
          <Paper key={`${word.id}:${word.card?.reps}`} flex={1} mih={0}>
            <ScrollArea
              h="100%"
              type="never"
              scrollbars="y"
              viewportProps={{ tabIndex: 0 }}
              styles={{ content: { display: "flex", minHeight: "100%" } }}
            >
              <Stack flex={1} miw={0}>
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
                    <Text variant="supporting">{t("study_reveal_hint")}</Text>
                  </Stack>
                  <Stack
                    display={revealed ? undefined : "none"}
                    style={{ gridArea: "1 / 1" }}
                    aria-hidden={!revealed}
                    inert={!revealed}
                  >
                    <Stack align="center" ta="center" gap="xs">
                      {front === "sentence" && (
                        <Title order={2} lang={word.language}>
                          {word.lemma}
                        </Title>
                      )}
                      <Group justify="center" gap="xs">
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
                    </Stack>
                    <CardDefinitions
                      key={word.id}
                      id={word.id}
                      context={context}
                      contextLoading={sentenceLoading}
                      loadDefinitions={preload.loadDefinitions}
                      settings={settings}
                      onError={setError}
                    />
                    {context && (
                      <ContextSentence
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
            title={queue?.total ? t("no_reviews_due") : t("no_saved_words")}
          >
            {queue?.waiting && (
              <Text>
                {t("next_review_in", {
                  value1: intervalLabel(queue.waiting, settings.rolloverHour),
                })}
              </Text>
            )}
            {!queue?.total && (
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
