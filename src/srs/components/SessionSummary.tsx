import {
  Badge,
  Button,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { ArrowLeft, Flame, Upload } from "lucide-react";
import type { Settings } from "@/settings/model";
import { number, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import type { Responses } from "@/srs/contracts";
import type { SessionAnswer } from "@/srs/hooks/useReviewSession";
import { useReviewStatistics } from "@/srs/hooks/useReviewStatistics";
import { intervalLabel } from "@/srs/components/Ratings";

export function SessionSummary({
  answers,
  queue,
  settings,
  busy,
  canUndo,
  onStudyMore,
  onUndo,
}: {
  answers: SessionAnswer[];
  queue: Responses["queue"];
  settings: Settings;
  busy: boolean;
  canUndo: boolean;
  onStudyMore: () => void;
  onUndo: () => void;
}) {
  const { data, error } = useReviewStatistics();
  const recall = answers.filter((answer) => answer.recall);
  const passed = recall.filter((answer) => answer.rating !== 1).length;
  const seconds = Math.round(
    answers.reduce((sum, answer) => sum + answer.durationMs, 0) / 1000,
  );
  const grades = (["again", "hard", "good", "easy"] as const).map(
    (label, index) => ({
      label: t(label),
      color: ["red", "orange", "green", "blue"][index],
      count: answers.filter((answer) => answer.rating === index + 1).length,
    }),
  );
  const metrics = [
    [t("session_reviews"), number(answers.length)],
    [
      t("session_new_cards"),
      number(answers.filter((answer) => answer.introduced).length),
    ],
    [
      t("session_recall_rate"),
      recall.length
        ? number(passed / recall.length, {
            style: "percent",
            maximumFractionDigits: 0,
          })
        : "—",
    ],
    [
      t("session_time"),
      number(seconds < 60 ? seconds : seconds / 60, {
        style: "unit",
        unit: seconds < 60 ? "second" : "minute",
        unitDisplay: "short",
        maximumFractionDigits: 1,
      }),
    ],
  ];
  return (
    <Paper w="100%" maw={480} p="lg">
      <Stack gap="lg">
        <Title order={2} ta="center">
          {answers.length
            ? t("session_complete")
            : queue.total
              ? t("no_reviews_due")
              : t("no_saved_words")}
        </Title>
        <ErrorBox error={error} />
        {!!data?.calendar.current && (
          <Group justify="center" gap="xs">
            <ThemeIcon variant="light" color="orange">
              <Flame size={18} aria-hidden />
            </ThemeIcon>
            <Text>
              {t("session_streak", {
                days: t("srs_heatmap_days", { count: data.calendar.current }),
              })}
            </Text>
          </Group>
        )}
        {answers.length > 0 && (
          <>
            <SimpleGrid cols={2}>
              {metrics.map(([label, value]) => (
                <Stack key={label} gap={0} align="center" ta="center">
                  <Text fw={700}>{value}</Text>
                  <Text variant="supporting">{label}</Text>
                </Stack>
              ))}
            </SimpleGrid>
            <Tooltip
              label={t("session_recall_help")}
              multiline
              maw={320}
              events={{ hover: true, focus: true, touch: true }}
            >
              <Text variant="supporting" ta="center" tabIndex={0}>
                {recall.length
                  ? t("session_recalled", {
                      passed: number(passed),
                      total: number(recall.length),
                    })
                  : t("session_no_recall")}
              </Text>
            </Tooltip>
            <Stack gap="xs">
              <Progress.Root>
                {grades
                  .filter((grade) => grade.count)
                  .map((grade) => (
                    <Progress.Section
                      key={grade.label}
                      value={(grade.count / answers.length) * 100}
                      color={grade.color}
                      aria-label={`${grade.label}: ${number(grade.count)}`}
                    />
                  ))}
              </Progress.Root>
              <Group gap="xs" justify="center">
                {grades
                  .filter((grade) => grade.count)
                  .map((grade) => (
                    <Badge
                      key={grade.label}
                      color={grade.color}
                      variant="light"
                    >
                      {grade.label}: {number(grade.count)}
                    </Badge>
                  ))}
              </Group>
            </Stack>
          </>
        )}
        {!!queue.total && (
          <Text variant="supporting" ta="center">
            {queue.forecast
              .map(({ days, count }) =>
                t(days === 1 ? "session_due_tomorrow" : "session_due_in_days", {
                  days,
                  count: number(count),
                }),
              )
              .join(" · ")}
          </Text>
        )}
        {!!queue.waiting && (
          <Text variant="supporting" ta="center">
            {t("next_review_in", {
              value1: intervalLabel(queue.waiting, settings.rolloverHour),
            })}
          </Text>
        )}
        {!queue.total && (
          <>
            <Text variant="supporting">
              {t("use_your_lookup_control_on_a_word_to")}
            </Text>
            <Button
              component="a"
              href="#settings"
              leftSection={<Upload size={16} aria-hidden />}
            >
              {t("import_dictionary")}
            </Button>
          </>
        )}
        <Stack gap="xs">
          <Text variant="supporting" ta="center">
            {t(
              queue.canStudyMore ? "session_more_help" : "session_nothing_more",
            )}
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <Button
              disabled={!queue.canStudyMore || busy}
              loading={busy}
              onClick={onStudyMore}
            >
              {t("session_study_more")}
            </Button>
            <Button
              component="a"
              href="#review"
              variant="filled"
              leftSection={<ArrowLeft size={16} aria-hidden />}
            >
              {t("study_end_session")}
            </Button>
          </SimpleGrid>
          {canUndo && (
            <Button variant="subtle" disabled={busy} onClick={onUndo}>
              {t("undo_last_review")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
