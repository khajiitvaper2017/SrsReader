import type { Dictionary } from "@/dictionaries/model";
import { rpc } from "@/platform/messaging/send";
import { type Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { srsClient } from "@/srs/client";
import { useEffect, useState } from "react";

export function useSrsSettings({
  settings,
  onError,
}: {
  settings: Settings;
  dictionaries: Dictionary[];
  onChange: (patch: Partial<Settings>) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] =
    useState<Awaited<ReturnType<typeof rpc<{ action: "rwkvStatus" }>>>>();
  const [bands, setBands] = useState(settings.retentionBands);
  useEffect(() => setBands(settings.retentionBands), [settings.retentionBands]);
  useEffect(() => {
    void srsClient({ action: "rwkvStatus" })
      .then(setStatus)
      .catch((error) => onError(error.message));
  }, [settings.algorithm, settings.rolloverHour]);
  async function task(work: () => Promise<void>) {
    setBusy(true);
    onError("");
    setMessage("");
    try {
      await work();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    setMessage(t("rwkv_preparing"));
    let progress = await srsClient({ action: "rwkvStatus" });
    while (!progress.ready) {
      progress = await srsClient({ action: "prepareRwkv" });
      setStatus(progress);
      setMessage(
        t("rwkv_replaying", {
          processed: progress.processed,
          total: progress.total,
        }),
      );
    }
  }

  return { busy, message, setMessage, status, bands, setBands, task, prepare };
}
