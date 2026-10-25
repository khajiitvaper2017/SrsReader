import { Group, Progress, Stack, Text } from "@mantine/core";
import type { ImportProgress } from "@/shared/download";
import { downloadSize, number, t } from "@/shared/i18n/i18n";
import { useEffect, useRef, useState } from "react";
export function TaskProgress({ progress }: { progress: ImportProgress }) {
  const { phase, done, total, unit } = progress;
  const timing = useRef({ phase, unit, done, lastDone: done, at: 0 });
  const [remaining, setRemaining] = useState<number>();
  useEffect(() => {
    const now = performance.now();
    const start = timing.current;
    if (
      !start.at ||
      start.phase !== phase ||
      start.unit !== unit ||
      done < start.lastDone
    ) {
      timing.current = { phase, unit, done, lastDone: done, at: now };
      setRemaining(undefined);
      return;
    }
    start.lastDone = done;
    const elapsed = now - start.at;
    setRemaining(
      total > done && done > start.done && elapsed >= 1000
        ? Math.ceil(((elapsed / 1000) * (total - done)) / (done - start.done))
        : undefined,
    );
  }, [phase, unit, done, total]);
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
    <Stack>
      <Group justify="space-between">
        <Text variant="supporting">{phase}</Text>
        <Text variant="supporting">
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
      {remaining !== undefined && (
        <Text variant="supporting">
          {t("task_time_remaining", {
            duration: number(
              remaining < 60 ? remaining : Math.ceil(remaining / 60),
              {
                style: "unit",
                unit: remaining < 60 ? "second" : "minute",
                unitDisplay: "short",
              },
            ),
          })}
        </Text>
      )}
    </Stack>
  );
}
