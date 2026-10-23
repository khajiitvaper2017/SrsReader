import { Text } from "@mantine/core";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";
export function SrsProgress() {
  const [progress, setProgress] = useState<
    { ready: boolean } & (
      { processed: number; total: number } | { rescheduled: number }
    )
  >();
  useEffect(() => {
    const receive = (event: Event) =>
      setProgress((event as CustomEvent).detail);
    window.addEventListener("srs-progress", receive);
    return () => window.removeEventListener("srs-progress", receive);
  }, []);
  return progress && !progress.ready ? (
    <Text role="status">
      {"rescheduled" in progress
        ? t("srs_rescheduling", { count: progress.rescheduled })
        : t("rwkv_replaying", {
            processed: progress.processed,
            total: progress.total,
          })}
    </Text>
  ) : null;
}
