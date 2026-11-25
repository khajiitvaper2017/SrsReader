import type { Settings } from "@/settings/model";
import { srsClient } from "@/srs/client";
import type { Responses } from "@/srs/contracts";
import { useEffect, useState } from "react";
import OptimizeWorker from "@/srs/optimize.worker?worker";
import { t } from "@/shared/i18n/i18n";

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

  async function optimize() {
    const worker = new OptimizeWorker();
    try {
      const weights = await new Promise<number[]>((resolve, reject) => {
        worker.onmessage = ({ data }) => {
          if (data.type === "result") resolve(data.weights);
          else
            reject(
              new Error(
                t(
                  data.type === "insufficient"
                    ? "srs_fsrs_optimization_insufficient"
                    : "srs_fsrs_optimization_failed",
                ),
              ),
            );
        };
        worker.onerror = () =>
          reject(new Error(t("srs_fsrs_optimization_failed")));
        worker.postMessage({
          fsrsVersion: settings.fsrsVersion,
          rolloverHour: settings.rolloverHour,
          relearningSteps: settings.relearningSteps,
        });
      });
      return await srsClient({
        action: "saveFsrsOptimization",
        model: { version: settings.fsrsVersion, weights },
        rolloverHour: settings.rolloverHour,
      });
    } finally {
      worker.terminate();
    }
  }

  return { busy, status, bands, setBands, task, prepare, optimize };
}
