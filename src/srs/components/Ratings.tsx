import { Button, SimpleGrid, Stack, Text } from "@mantine/core";
import { number, t } from "@/shared/i18n/i18n";
export function intervalLabel(time: number) {
  const minutes = Math.max(1, Math.round((time - Date.now()) / 60000));
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
  const buttons = [t("again"), t("hard"), t("good"), t("easy")].map(
    (label, i) =>
      onlyAgainGood && i !== 0 && i !== 2 ? null : (
        <Button
          key={label}
          title={times[i] ? intervalLabel(times[i]!) : undefined}
          disabled={disabled}
          onClick={() => onGrade(i + 1)}
          variant="light"
          color={["red", "orange", "green", "blue"][i]}
          h={compact ? 40 : undefined}
          px={4}
          miw={0}
        >
          <Stack gap={compact ? 0 : undefined} align="center">
            <Text span inherit>
              {label}
            </Text>
            <Text variant="supporting" span>
              {times[i] ? intervalLabel(times[i]!) : "—"}
            </Text>
          </Stack>
        </Button>
      ),
  );
  return compact ? (
    <>{buttons}</>
  ) : (
    <SimpleGrid cols={onlyAgainGood ? 2 : 4}>{buttons}</SimpleGrid>
  );
}
