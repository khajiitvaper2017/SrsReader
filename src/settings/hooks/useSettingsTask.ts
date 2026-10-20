import type { ImportProgress } from "@/shared/download";
import { useEffect, useState } from "react";

export function useSettingsTask() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>();
  const [progressTarget, setProgressTarget] = useState<
    "dictionary" | "examples" | "morphology"
  >("dictionary");
  useEffect(() => {
    if (!busy) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", prevent);
    return () => removeEventListener("beforeunload", prevent);
  }, [busy]);
  async function task(operation: () => Promise<void>) {
    setBusy(true);
    setProgress(undefined);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }
  return {
    error,
    setError,
    notice,
    setNotice,
    busy,
    setBusy,
    progress,
    setProgress,
    progressTarget,
    setProgressTarget,
    run: task,
  };
}
export type SettingsTask = Pick<
  ReturnType<typeof useSettingsTask>,
  | "busy"
  | "progress"
  | "progressTarget"
  | "setProgress"
  | "setProgressTarget"
  | "setError"
  | "setNotice"
  | "run"
>;
