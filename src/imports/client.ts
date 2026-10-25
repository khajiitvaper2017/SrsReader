import { db } from "@/platform/database/db";
import { rpc } from "@/platform/messaging/send";
import { importInputSchema, type ImportInput } from "@/imports/model";
import { t } from "@/shared/i18n/i18n";
import { liveQuery } from "dexie";

export async function startImport(input: ImportInput) {
  const runId = crypto.randomUUID();
  const value = importInputSchema.parse(input);
  await db.transaction("rw", db.importTasks, async () => {
    if ((await db.importTasks.get("current"))?.status === "running")
      throw new Error(t("import_already_running"));
    await db.importTasks.put({
      ...value,
      id: "current",
      runId,
      status: "running",
    });
  });
  try {
    await rpc({ action: "runImport" });
  } catch (error) {
    await db.importTasks.update("current", {
      status: "error",
      error: (error as Error).message,
      blob: undefined,
    });
    throw error;
  }
  await new Promise<void>((resolve, reject) => {
    const subscription = liveQuery(() =>
      db.importTasks.get("current"),
    ).subscribe({
      next: (task) => {
        if (task?.runId === runId && task.status === "running") return;
        subscription.unsubscribe();
        if (task?.runId === runId && task.status === "error")
          reject(new Error(task.error));
        else resolve();
      },
      error: reject,
    });
  });
}

export async function dismissImport() {
  await db.transaction("rw", db.importTasks, async () => {
    if ((await db.importTasks.get("current"))?.status !== "running")
      await db.importTasks.delete("current");
  });
}
