import { Button, SimpleGrid, Stack, Text } from "@mantine/core";
import { number, t } from "@/shared/i18n/i18n";
import { useSettings } from "@/settings/hooks/useSettings";
import { dayStart, studyDay } from "@/srs/study-day";
export function intervalLabel(time: number, rolloverHour: number) {
  const now = Date.now();
  const dueDay = studyDay(time, rolloverHour);
  if (time === dayStart(dueDay, rolloverHour))
    return t("interval_days", {
      count: Math.max(0, dueDay - studyDay(now, rolloverHour)),
    });
  const minutes = Math.max(1, Math.round((time - now) / 60000));
  if (minutes < 60) return t("interval_minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("interval_hours", { count: hours });
  const days = Math.round(hours / 24);
  return days < 365
    ? t("interval_days", { count: days })
    : t("interval_years", {
        value: number(days / 365, { maximumFractionDigits: 1 }),
      });
}
export function Ratings({
  times,
  disabled,
  onGrade,
  onlyAgainGood,
  compact = false,
}: {
  times: number[];
  disabled: boolean;
  onGrade: (rating: number) => void;
  onlyAgainGood: boolean;
  compact?: boolean;
}) {
  const [{ rolloverHour }] = useSettings();
  const buttons = [t("again"), t("hard"), t("good"), t("easy")].map(
    (label, i) =>
      onlyAgainGood && i !== 0 && i !== 2 ? null : (
        <Button
          key={label}
          title={times[i] ? intervalLabel(times[i]!, rolloverHour) : undefined}
          disabled={disabled}
          onClick={() => onGrade(i + 1)}
          variant="light"
          color={["red", "orange", "green", "blue"][i]}
          mih={compact ? 40 : undefined}
          px={4}
          miw={0}
        >
          <Stack gap={0} align="center">
            <Text span inherit>
              {label}
            </Text>
            <Text variant="supporting" span>
              {times[i] ? intervalLabel(times[i]!, rolloverHour) : "—"}
            </Text>
          </Stack>
        </Button>
      ),
  );
  return compact ? (
    <>{buttons}</>
  ) : (
    <SimpleGrid cols={{ base: 2, xs: onlyAgainGood ? 2 : 4 }}>
      {buttons}
    </SimpleGrid>
  );
}
