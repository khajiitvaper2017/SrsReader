import {
  Accordion,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { i18n, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { ReviewCalendar } from "@/srs/components/ReviewCalendar";
import { useReviewStatistics } from "@/srs/hooks/useReviewStatistics";
import { useState } from "react";

export function ReviewStatistics() {
  const { data, error, loading, setYear } = useReviewStatistics();
  const [days, setDays] = useState("7");
  const locale = i18n.resolvedLanguage;
  const number = (value: number) => value.toLocaleString(locale);
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  return (
    <Stack gap="xs">
      <ErrorBox error={error} />
      {!data && !error && (
        <Loader size="sm" aria-label={t("srs_stats_loading")} />
      )}
      {data && (
        <>
          <ReviewCalendar
            calendar={data.calendar}
            today={data.today}
            loading={loading}
            onYear={setYear}
          />
          <Accordion multiple>
            <Accordion.Item value="statistics">
              <Accordion.Control>{t("srs_statistics")}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                    {(
                      [
                        ["srs_saved_words", data.total],
                        ["new", data.fresh],
                        ["srs_queue_learning", data.learning],
                        ["srs_queue_relearning", data.relearning],
                        ["review", data.reviews],
                        ["mastered", data.known],
                        ["suspended", data.suspended],
                      ] as const
                    ).map(([label, value]) => (
                      <Paper key={label} withBorder p="xs">
                        <Text size="xs" c="dimmed">
                          {t(label)}
                        </Text>
                        <Text fw={700}>{number(value)}</Text>
                      </Paper>
                    ))}
                  </SimpleGrid>
                  <Text fw={600} size="sm">
                    {t("srs_last_30_days")}
                  </Text>
                  <Text size="sm">
                    {t("srs_period_answers", {
                      answers: number(data.answers),
                      days: number(data.studyDays),
                    })}
                  </Text>
                  <Text size="sm">
                    {t("srs_period_recall", {
                      value:
                        data.recall === null
                          ? "—"
                          : `${number(Math.round(data.recall * 100))}%`,
                      count: data.normalAnswers,
                    })}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t("srs_recall_help")}
                  </Text>
                  <Text size="sm">
                    {t("srs_period_time", {
                      minutes: (data.durationMs / 60000).toLocaleString(
                        locale,
                        {
                          maximumFractionDigits: 1,
                        },
                      ),
                      count: data.timedAnswers,
                    })}
                  </Text>
                  <Group gap="sm">
                    {["again", "hard", "good", "easy"].map((rating, index) => (
                      <Text key={rating} size="sm">
                        {t(rating)}: {number(data.ratings[index]!)}
                      </Text>
                    ))}
                  </Group>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="forecast">
              <Accordion.Control>{t("srs_forecast")}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Text size="sm" c="dimmed">
                    {t("srs_forecast_help")}
                  </Text>
                  <SegmentedControl
                    value={days}
                    onChange={setDays}
                    aria-label={t("srs_forecast_range")}
                    data={[
                      { value: "7", label: t("srs_next_7_days") },
                      { value: "30", label: t("srs_next_30_days") },
                    ]}
                  />
                  <Table tabularNums>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("srs_forecast_date")}</Table.Th>
                        <Table.Th ta="right">
                          {t("srs_forecast_cards")}
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.forecast
                        .slice(0, Number(days))
                        .map((day, index) => (
                          <Table.Tr key={day.time}>
                            <Table.Td>
                              {index === 0
                                ? t("srs_forecast_today")
                                : date.format(day.time)}
                            </Table.Td>
                            <Table.Td ta="right">{number(day.count)}</Table.Td>
                          </Table.Tr>
                        ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </>
      )}
    </Stack>
  );
}
