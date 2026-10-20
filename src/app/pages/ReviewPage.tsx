import {
  SegmentedControl,
  Badge,
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
import { ReviewStatistics } from "@/srs/components/ReviewStatistics";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { useReviewSession } from "@/srs/hooks/useReviewSession";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { vocabularyClient } from "@/vocabulary/client";
import { Sentence } from "@/vocabulary/components/Sentence";
import { Check, Eye, Pause, Undo2, Upload } from "lucide-react";
export function ReviewPage({
  settings,
  stats,
}: {
  settings: Settings;
  stats: {
    total: number;
    due: number;
    known: number;
    today: number;
  };
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
    load,
    gradeWord,
    reveal,
    undo,
  } = useReviewSession({ settings, stats });
  return (
    <>
      <SrsProgress />
      <Group gap="xs" mb="sm">
        {(
          [
            ["new", queue?.fresh],
            ["srs_queue_learning", queue?.learning],
            ["srs_queue_relearning", queue?.relearning],
            ["review", queue?.reviews],
            ["reviewed_today", stats.today],
          ] as const
        ).map(([label, count]) => (
          <Text key={label} size="sm">
            {t(label)}{" "}
            <Text span fw={700}>
              {count ?? "—"}
            </Text>
          </Text>
        ))}
      </Group>
      {!!queue?.ahead && (
        <Text size="xs" c="dimmed" mb="sm">
          {t("srs_queue_ahead", { count: queue.ahead })}
        </Text>
      )}
      <ErrorBox error={error} />
      <Stack gap="xs">
        <Paper mb="md">
          <Stack gap="md">
            <Group justify="center" mb="lg">
              <SegmentedControl
                size="xs"
                value={front}
                onChange={(value) => setFront(value as typeof front)}
                data={[
                  { value: "word", label: t("word") },
                  { value: "sentence", label: t("in_context") },
                ]}
              />
            </Group>
            {word ? (
              <>
                <Stack gap="xs" align="center" ta="center" py="lg">
                  <Badge variant="light">
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
                    <Stack gap="xs">
                      <Sentence context={context} language={word.language} />
                    </Stack>
                  ) : (
                    <Title lang={word.language} order={2} fz={32}>
                      {word.lemma}
                    </Title>
                  )}
                  {word.reading && (
                    <Text component="span" inherit c="dimmed">
                      {word.reading}
                    </Text>
                  )}
                </Stack>
                {revealed ? (
                  <Stack gap="xs">
                    <Group gap="xs" align="center" justify="space-between">
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
                      <Stack gap="xs">
                        <Sentence context={context} language={word.language} />
                        {settings.showSentenceTranslation && (
                          <SentenceTranslation
                            key={`${word.id}:${example}`}
                            context={context}
                            language={word.language}
                            settings={settings}
                            wordId={word.id}
                          />
                        )}
                        <Group gap="xs" align="center" justify="space-between">
                          {context.url.startsWith("http") ? (
                            <Anchor
                              href={context.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {context.title || new URL(context.url).hostname}
                            </Anchor>
                          ) : (
                            <span>{context.title}</span>
                          )}
                          <AudioButton
                            word={word}
                            sentence={context.sentence}
                            settings={settings}
                            onError={setError}
                          />
                        </Group>
                        {word.contexts.length > 1 && (
                          <Button
                            onClick={() =>
                              setExample((example + 1) % word.contexts.length)
                            }
                            variant="subtle"
                          >
                            {t("example_position", {
                              current: example + 1,
                              total: word.contexts.length,
                            })}
                          </Button>
                        )}
                      </Stack>
                    )}
                    <Ratings
                      times={times}
                      disabled={busy}
                      onlyAgainGood={settings.onlyAgainGood}
                      onGrade={(rating) => void gradeWord(rating)}
                    />
                  </Stack>
                ) : (
                  <Stack gap="xs">
                    <Button onClick={reveal} variant="filled">
                      <Eye aria-hidden="true" size={16} /> {t("show_answer")}{" "}
                      <Kbd size="xs">{t("space")}</Kbd>
                    </Button>
                  </Stack>
                )}
              </>
            ) : (
              <Empty
                title={
                  queue?.waiting
                    ? t("no_reviews_due")
                    : stats.total
                      ? t("no_reviews_due")
                      : t("no_saved_words")
                }
              >
                <Text>
                  {queue?.waiting
                    ? t("next_review_in", {
                        value1: intervalLabel(queue.waiting),
                      })
                    : stats.total
                      ? ""
                      : t("use_your_lookup_control_on_a_word_to")}
                </Text>
                {!stats.total && (
                  <Button href="#settings" component="a" variant="filled">
                    <Upload aria-hidden="true" size={16} />{" "}
                    {t("import_dictionary")}
                  </Button>
                )}
              </Empty>
            )}
            <Stack gap="xs" component="footer">
              <ActionIcon
                title={t("undo_last_review")}
                aria-label={t("undo_last_review")}
                disabled={!last || busy}
                onClick={() => void undo()}
                variant="subtle"
              >
                <Undo2 aria-hidden="true" size={16} />
              </ActionIcon>
              {word && (
                <Button
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
                  variant="subtle"
                >
                  <Check aria-hidden="true" size={16} /> {t("master")}{" "}
                </Button>
              )}
              {word && (
                <Button
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
                  variant="subtle"
                >
                  <Pause aria-hidden="true" size={16} />{" "}
                  {t("suspend_word")}{" "}
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Stack>
      <ReviewStatistics />
    </>
  );
}
