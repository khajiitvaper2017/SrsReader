import { Group, Progress, Stack, Text } from "@mantine/core";
import type { ImportProgress } from "@/shared/download";
import { downloadSize, number } from "@/shared/i18n/i18n";
export function TaskProgress({ progress }: { progress: ImportProgress }) {
  const { phase, done, total, unit } = progress;
  const percent = total ? Math.min(100, (done / total) * 100) : undefined;
  const detail =
    unit === "bytes"
      ? `${downloadSize(done)}${total ? ` / ${downloadSize(total)}` : ""}`
      : total
        ? `${number(Math.floor(done))} / ${number(total)}`
        : done
          ? number(done)
          : "";
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs">
        <Text size="xs">{phase}</Text>
        <Text size="xs" c="dimmed">
          {detail}
          {percent !== undefined &&
            ` · ${number(percent / 100, { style: "percent", maximumFractionDigits: 0 })}`}
        </Text>
      </Group>
      <Progress.Root
        role="progressbar"
        aria-label={phase}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={detail || undefined}
        size="sm"
      >
        <Progress.Section
          value={percent ?? 100}
          animated={percent === undefined}
          withAria={false}
        />
      </Progress.Root>
    </Stack>
  );
}
