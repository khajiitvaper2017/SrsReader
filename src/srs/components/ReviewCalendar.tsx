import {
  ActionIcon,
  Box,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { i18n, t } from "@/shared/i18n/i18n";
import type { ReviewStatistics } from "@/srs/statistics";
import { useEffect, useRef, useState } from "react";

export function ReviewCalendar({
  calendar,
  today,
  loading,
  onYear,
}: {
  calendar: ReviewStatistics["calendar"];
  today: ReviewStatistics["today"];
  loading: boolean;
  onYear: (year: number) => void;
}) {
  const scheme = useComputedColorScheme("light");
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = useState(0);
  useEffect(() => {
    setFocused(
      Math.max(
        0,
        calendar.days.findIndex((day) => day.day === calendar.today),
      ),
    );
  }, [calendar.year, calendar.today]);
  const locale = i18n.resolvedLanguage;
  const format = (value: number) =>
    value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const offset = (new Date(calendar.days[0]!.time).getDay() + 6) % 7;
  const weeks = Math.ceil((offset + calendar.days.length) / 7);
  const thresholds = [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map(
    (factor) => factor * Math.max(20, calendar.average),
  );
  const metrics = [
    [
      "srs_heatmap_average",
      t("srs_heatmap_cards", { count: Math.round(calendar.average) }),
    ],
    [
      "srs_heatmap_learned",
      calendar.learned.toLocaleString(locale, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
    ],
    ["srs_heatmap_longest", t("srs_heatmap_days", { count: calendar.longest })],
    ["srs_heatmap_current", t("srs_heatmap_days", { count: calendar.current })],
  ] as const;
  return (
    <Paper p="sm" data-srs-reader="true">
      <Stack gap="sm">
        <Text size="sm" ta="center">
          {t(
            today.timedAnswers === today.answers
              ? "srs_heatmap_today"
              : "srs_heatmap_today_partial",
            {
              answers: format(today.answers),
              minutes: format(today.durationMs / 60000),
              seconds: format(
                today.timedAnswers
                  ? today.durationMs / today.timedAnswers / 1000
                  : 0,
              ),
              timed: format(today.timedAnswers),
            },
          )}
        </Text>
        <Group gap={4} justify="center">
          <Tooltip label={t("srs_heatmap_previous")}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={t("srs_heatmap_previous")}
              disabled={loading || calendar.year <= 1970}
              onClick={() => onYear(calendar.year - 1)}
            >
              <ChevronLeft size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("srs_heatmap_this_year")}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={t("srs_heatmap_this_year")}
              disabled={loading}
              onClick={() => onYear(calendar.currentYear)}
            >
              <Circle size={12} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("srs_heatmap_next")}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={t("srs_heatmap_next")}
              disabled={loading || calendar.year >= 9998}
              onClick={() => onYear(calendar.year + 1)}
            >
              <ChevronRight size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Box
          role="group"
          aria-label={t("srs_heatmap_calendar", { year: calendar.year })}
          display="grid"
          w="100%"
          maw={636}
          mx="auto"
          style={{
            gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
            gridTemplateRows: "repeat(7, 1fr)",
            gridAutoFlow: "column",
            gap: 2,
          }}
        >
          {Array.from({ length: offset }, (_, index) => (
            <Box key={`empty-${index}`} aria-hidden="true" />
          ))}
          {calendar.days.map((day, index) => {
            const count = day.studied || day.due;
            const level = thresholds.filter(
              (threshold) => count > threshold,
            ).length;
            const shade = scheme === "dark" ? 9 - level : level;
            const dueShade =
              scheme === "dark"
                ? 8 - Math.round((2 * level) / 9)
                : 3 + Math.round((3 * level) / 9);
            const label = `${date.format(day.time)}. ${t("srs_heatmap_studied", { value: format(day.studied) })}. ${t("srs_heatmap_due", { value: format(day.due) })}`;
            return (
              <Tooltip
                key={day.time}
                label={
                  <Stack gap={2}>
                    <Text size="xs">{date.format(day.time)}</Text>
                    <Text size="xs">
                      {t(
                        day.day > calendar.today
                          ? "srs_heatmap_due"
                          : "srs_heatmap_studied",
                        {
                          value: format(
                            day.day > calendar.today ? day.due : day.studied,
                          ),
                        },
                      )}
                    </Text>
                    {day.day === calendar.today && (
                      <Text size="xs">
                        {t("srs_heatmap_due", { value: format(day.due) })}
                      </Text>
                    )}
                  </Stack>
                }
                withArrow
                events={{ hover: true, focus: true, touch: true }}
              >
                <UnstyledButton
                  aria-label={label}
                  data-day={day.day}
                  ref={(node) => {
                    cells.current[index] = node;
                  }}
                  tabIndex={index === focused ? 0 : -1}
                  onFocus={() => setFocused(index)}
                  bg={
                    day.studied
                      ? `accent.${shade}`
                      : day.due
                        ? `gray.${dueShade}`
                        : "var(--mantine-color-default-hover)"
                  }
                  style={{
                    aspectRatio: "1",
                    boxShadow:
                      day.day === calendar.today
                        ? "inset 0 0 0 1px var(--mantine-color-text)"
                        : undefined,
                  }}
                  onKeyDown={(event) => {
                    const move = {
                      ArrowLeft: -7,
                      ArrowRight: 7,
                      ArrowUp: -1,
                      ArrowDown: 1,
                    }[event.key];
                    if (move === undefined) return;
                    event.preventDefault();
                    const next = Math.min(
                      calendar.days.length - 1,
                      Math.max(0, index + move),
                    );
                    cells.current[next]?.focus();
                  }}
                />
              </Tooltip>
            );
          })}
        </Box>
        <Text size="xs" c="dimmed" ta="center">
          {calendar.year}
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
          {metrics.map(([label, value]) => (
            <Text key={label} size="xs" ta="center">
              {t(label)}:{" "}
              <Text span c="accent" fw={700}>
                {value}
              </Text>
            </Text>
          ))}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
