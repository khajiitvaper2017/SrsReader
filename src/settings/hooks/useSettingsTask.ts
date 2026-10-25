import type { ImportProgress } from "@/shared/download";
import type { ImportTask } from "@/imports/model";
import { dismissImport } from "@/imports/client";
import { db } from "@/platform/database/db";
import { rpc } from "@/platform/messaging/send";
import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

export function useSettingsTask() {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [importTask, setImportTask] = useState<ImportTask>();
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.importTasks.get("current"),
    ).subscribe({
      next: setImportTask,
      error: (error) => setError(String(error)),
    });
    void rpc({ action: "runImport" }).catch((error) => setError(error.message));
    return () => subscription.unsubscribe();
  }, []);
  const [progress, setProgress] = useState<ImportProgress>();
  const [progressTarget, setProgressTarget] = useState<
    "dictionary" | "examples" | "morphology"
  >("dictionary");
  useEffect(() => {
    if (!busy || importTask?.status === "running") return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", prevent);
    return () => removeEventListener("beforeunload", prevent);
  }, [busy, importTask?.status]);
  async function task(operation: () => Promise<void>) {
    setBusy(true);
    setProgress(undefined);
    setError("");
    setNotice("");
    try {
      await dismissImport();
      await operation();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }
  return {
    error: importTask?.error || error,
    setError,
    notice: importTask?.notice || notice,
    setNotice,
    busy: busy || importTask?.status === "running",
    setBusy,
    progress: importTask?.status === "running" ? importTask.progress : progress,
    setProgress,
    progressTarget:
      importTask?.status === "running" ? importTask.type : progressTarget,
    setProgressTarget,
    run: task,
    dismissImport,
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
