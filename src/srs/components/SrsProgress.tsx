import { Text } from "@mantine/core";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";
export function SrsProgress() {
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
    ready: boolean;
  }>();
  useEffect(() => {
    const receive = (event: Event) =>
      setProgress((event as CustomEvent).detail);
    window.addEventListener("srs-progress", receive);
    return () => window.removeEventListener("srs-progress", receive);
  }, []);
  return progress && !progress.ready ? (
    <Text role="status">
      {t("rwkv_replaying", {
        processed: progress.processed,
        total: progress.total,
      })}
    </Text>
  ) : null;
}
