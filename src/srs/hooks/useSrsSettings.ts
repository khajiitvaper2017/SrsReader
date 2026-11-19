import type { Settings } from "@/settings/model";
import { srsClient } from "@/srs/client";
import type { Responses } from "@/srs/contracts";
import { useEffect, useState } from "react";

export function useSrsSettings({
  settings,
  onError,
}: {
  settings: Settings;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Responses["rwkvStatus"]>();
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
    try {
      await work();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    let progress = await srsClient({ action: "rwkvStatus" });
    while (!progress.ready) {
      progress = await srsClient({ action: "prepareRwkv" });
      setStatus(progress);
    }
  }

  return { busy, status, bands, setBands, task, prepare };
}
