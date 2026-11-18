import {
  Box,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useState, type ReactNode } from "react";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { i18n, number, t } from "@/shared/i18n/i18n";
import { ReviewCalendar } from "@/srs/components/ReviewCalendar";
import { useReviewStatistics } from "@/srs/hooks/useReviewStatistics";
import type {
  ReviewStatistics,
  StatisticsRange,
  StatisticsScope,
} from "@/srs/statistics";
import { dayStart } from "@/srs/study-day";

type Option = { value: string; label: string };
type Point = { label: string; count: number; detail?: string };

export function StudyStatistics({
  initial,
  options,
  onClose,
}: {
  initial: string;
  options: Option[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  const [range, setRange] = useState<StatisticsRange>(30);
  const scope =
    selected === "collection"
      ? undefined
      : (JSON.parse(selected) as StatisticsScope);
  return (
    <Modal
      opened
      onClose={onClose}
      size="80rem"
      title={t("srs_stats_title")}
      closeButtonProps={{ "aria-label": t("close") }}
    >
      <Stack>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Select
            label={t("srs_stats_scope")}
            data={options}
            value={selected}
            onChange={(value) => value && setSelected(value)}
            searchable
            allowDeselect={false}
          />
          <Select
            label={t("srs_stats_period")}
            data={([30, 90, 365] as const).map((days) => ({
              value: String(days),
              label: t("srs_stats_days", { days: number(days) }),
            }))}
            value={String(range)}
            onChange={(value) => {
              if (value) setRange(Number(value) as StatisticsRange);
            }}
            allowDeselect={false}
          />
        </SimpleGrid>
        <StatisticsPanels
          key={`${selected}:${range}`}
          scope={scope}
          range={range}
        />
      </Stack>
    </Modal>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Title order={3}>{title}</Title>
        {children}
      </Stack>
    </Paper>
  );
}

function Bars({
  title,
  points,
  color = "accent.6",
  summary,
}: {
  title: string;
  points: Point[];
  color?: string;
  summary?: string;
}) {
  const peak = points.reduce((max, point) => Math.max(max, point.count), 0);
  const descriptions = points.map(
    (point) =>
      point.detail ??
      t("srs_stats_point", { label: point.label, value: number(point.count) }),
  );
  return (
    <Panel title={title}>
      {peak ? (
        <>
          <Text variant="supporting">{number(peak)}</Text>
          <Box
            role="img"
            aria-label={`${title}. ${descriptions.join(". ")}`}
            display="grid"
            h="7rem"
            style={{
              gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
              gap: 2,
              borderBottom: "1px solid var(--mantine-color-default-border)",
            }}
          >
            {points.map((point, index) => (
              <Tooltip
                key={point.label}
                label={descriptions[index]}
                events={{ hover: true, focus: false, touch: true }}
              >
                <Box h="100%" display="flex" style={{ alignItems: "flex-end" }}>
                  <Box
                    w="100%"
                    bg={color}
                    h={`${(point.count / peak) * 100}%`}
                  />
                </Box>
              </Tooltip>
            ))}
          </Box>
          <Group justify="space-between">
            <Text variant="supporting">{points[0]?.label}</Text>
            <Text variant="supporting">{points.at(-1)?.label}</Text>
          </Group>
        </>
      ) : (
        <Text variant="supporting">{t("srs_stats_empty")}</Text>
      )}
      {summary && <Text variant="supporting">{summary}</Text>}
    </Panel>
  );
}

const percent = (value: number) =>
  number(value, { style: "percent", maximumFractionDigits: 1 });

function StatisticsPanels({
  scope,
  range,
}: {
  scope?: StatisticsScope;
  range: StatisticsRange;
}) {
  const { data, error, loading, setYear } = useReviewStatistics(scope, range);
  if (error) return <ErrorBox error={error} />;
  if (!data?.details)
    return (
      <Group justify="center" role="status" aria-label={t("srs_stats_loading")}>
        <Loader size="sm" />
      </Group>
    );
  const { details } = data;
  const dates = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    month: "short",
    day: "numeric",
  });
  const datePoints = (buckets: typeof details.reviews) =>
    buckets.map(({ start, end, count }) => ({
      label:
        start === end
          ? dates.format(dayStart(start, 0))
          : dates.formatRange(dayStart(start, 0), dayStart(end, 0)),
      count,
    }));
  const durationPoints = (counts: number[]) =>
    counts.map((count, index) => ({
      label:
        index === details.dayLimits.length
          ? t("srs_stats_days_above", {
              days: number(details.dayLimits[index - 1]!),
            })
          : index === 0
            ? t("srs_stats_days_up_to", {
                days: number(details.dayLimits[index]!),
              })
            : t("srs_stats_days_between", {
                from: number(details.dayLimits[index - 1]!),
                to: number(details.dayLimits[index]!),
              }),
      count,
    }));
  const hours = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    hour: "numeric",
  });
  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Panel title={t("srs_stats_today")}>
          <Metrics
            items={[
              [t("srs_stats_answers"), number(data.today.answers)],
              [t("again"), number(data.today.again)],
              [
                t("srs_stats_minutes"),
                data.today.timedAnswers
                  ? number(data.today.durationMs / 60_000, {
                      maximumFractionDigits: 1,
                    })
                  : "—",
              ],
              [t("srs_stats_due_now"), number(details.due)],
            ]}
          />
        </Panel>
        <Panel title={t("srs_stats_card_counts")}>
          <CardCounts counts={details.counts} />
        </Panel>
        <Bars
          title={t("srs_stats_reviews")}
          points={datePoints(details.reviews)}
        />
        <Bars
          title={t("srs_stats_future_due")}
          points={datePoints(details.upcoming)}
          color="teal.6"
          summary={t("srs_stats_tomorrow", { value: number(details.tomorrow) })}
        />
      </SimpleGrid>
      <ReviewCalendar
        calendar={data.calendar}
        today={data.today}
        onYear={setYear}
        loading={loading}
        showToday={false}
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Bars
          title={t("srs_stats_interval")}
          points={durationPoints(details.durations.interval)}
        />
        <Bars
          title={t("srs_stats_stability")}
          points={durationPoints(details.durations.stability)}
          color="teal.6"
        />
        <Bars
          title={t("srs_stats_difficulty")}
          points={details.difficulty.map((count, index) => ({
            label: number(index + 1),
            count,
          }))}
          color="orange.6"
        />
        <Bars
          title={t("srs_stats_recall")}
          points={details.recall.map((count, index) => ({
            label: `${percent(index / 10)}–${percent((index + 1) / 10)}`,
            count,
          }))}
          color="teal.6"
        />
        <Panel title={t("srs_stats_retention")}>
          <Retention rows={details.retention} />
        </Panel>
        <Bars
          title={t("srs_stats_hourly")}
          points={details.hourly.map(({ count, passed }, index) => {
            const label = hours.format(new Date(2000, 0, 1, index));
            return {
              label,
              count,
              detail: count
                ? t("srs_stats_hour_point", {
                    label,
                    value: number(count),
                    rate: percent(passed / count),
                  })
                : undefined,
            };
          })}
        />
        <Panel title={t("srs_stats_grades")}>
          <Metrics
            items={["again", "hard", "good", "easy"].map((key, index) => [
              t(key),
              number(details.grades[index]!),
            ])}
          />
        </Panel>
        <Bars title={t("srs_stats_added")} points={datePoints(details.added)} />
      </SimpleGrid>
    </Stack>
  );
}

function Metrics({ items }: { items: [string, string][] }) {
  return (
    <SimpleGrid cols={2} spacing="sm">
      {items.map(([label, value]) => (
        <Stack key={label} gap={0}>
          <Text variant="supporting">{label}</Text>
          <Text fw={600}>{value}</Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

function CardCounts({
  counts,
}: {
  counts: NonNullable<ReviewStatistics["details"]>["counts"];
}) {
  const states = [
    ["new", "new", "blue"],
    ["learning", "srs_queue_learning", "orange"],
    ["relearning", "srs_stats_relearning", "red"],
    ["young", "srs_stats_young", "lime"],
    ["mature", "srs_stats_mature", "teal"],
    ["suspended", "suspended", "yellow"],
    ["mastered", "mastered", "grape"],
    ["unscheduled", "srs_stats_unscheduled", "gray"],
  ] as const;
  const total = states.reduce((sum, [key]) => sum + counts[key], 0);
  if (!total) return <Text variant="supporting">{t("srs_stats_empty")}</Text>;
  return (
    <Stack gap="xs">
      <Progress.Root size="sm" aria-label={t("srs_stats_card_counts")}>
        {states.map(
          ([key, label, color]) =>
            counts[key] > 0 && (
              <Progress.Section
                key={key}
                value={(counts[key] / total) * 100}
                color={color}
                aria-label={t(label)}
              />
            ),
        )}
      </Progress.Root>
      <SimpleGrid cols={2} spacing="xs">
        {states
          .filter(([key]) => counts[key])
          .map(([key, label, color]) => (
            <Group key={key} gap="xs" wrap="nowrap">
              <Box
                aria-hidden
                bg={`${color}.6`}
                w={8}
                h={8}
                style={{ flexShrink: 0 }}
              />
              <Text variant="supporting">
                {t("srs_stats_point", {
                  label: t(label),
                  value: number(counts[key]),
                })}
              </Text>
            </Group>
          ))}
      </SimpleGrid>
    </Stack>
  );
}

function Retention({
  rows,
}: {
  rows: NonNullable<ReviewStatistics["details"]>["retention"];
}) {
  const rate = ({ count, passed }: { count: number; passed: number }) =>
    count ? percent(passed / count) : "—";
  return (
    <>
      <Text variant="supporting">{t("srs_stats_retention_help")}</Text>
      <Table tabularNums>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{t("srs_stats_period")}</Table.Th>
            <Table.Th scope="col">{t("srs_stats_young")}</Table.Th>
            <Table.Th scope="col">{t("srs_stats_mature")}</Table.Th>
            <Table.Th scope="col">{t("srs_stats_answers")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(({ days, young, mature }) => (
            <Table.Tr key={days}>
              <Table.Th scope="row">
                {days === 1
                  ? t("srs_stats_today")
                  : days === 2
                    ? t("srs_stats_yesterday")
                    : t("srs_stats_days", { days: number(days) })}
              </Table.Th>
              <Table.Td>{rate(young)}</Table.Td>
              <Table.Td>{rate(mature)}</Table.Td>
              <Table.Td>{number(young.count + mature.count)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}
