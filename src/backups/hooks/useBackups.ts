import { readLearning, readSettings } from "@/backups/archive";
import { restoreLearning, restoreSettings } from "@/backups/restore";
import { dictionariesClient } from "@/dictionaries/client";
import { rpc } from "@/platform/messaging/send";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { number, t } from "@/shared/i18n/i18n";
import { useChanges } from "@/shared/hooks/useChanges";
import { useCallback, useEffect, useState } from "react";

export function useBackups({
  setSettings,
  tasks,
}: {
  setSettings: (settings: Settings) => void;
  tasks: SettingsTask;
}) {
  const { busy, setError, setNotice, run: task } = tasks;
  const [storageUsage, setStorageUsage] = useState<number | null>();
  const refreshStorage = useCallback(() => {
    void navigator.storage
      .estimate()
      .then(({ usage }) => setStorageUsage(usage ?? null))
      .catch((error) => {
        setStorageUsage(null);
        setError((error as Error).message);
      });
  }, [setError]);
  useEffect(() => {
    if (!busy) refreshStorage();
  }, [busy, refreshStorage]);
  useChanges(refreshStorage);
  async function fileImport(
    file: File | undefined,
    category: "settings" | "learning" | "full",
  ) {
    if (!file || busy) return;
    await task(async () => {
      if (category === "full") {
        const { readFull, restoreFull } = await import("@/backups/full");
        const backup = await readFull(file, tasks.setProgress);
        try {
          if (
            !confirm(
              t("full_backup_confirm", {
                words: backup.words,
                dictionaries: backup.dictionaries,
              }),
            )
          )
            return;
          setSettings(await restoreFull(backup, tasks.setProgress));
          sessionStorage.removeItem("last-review");
          await rpc({ action: "invalidate" });
          setNotice(t("full_backup_restored"));
        } finally {
          await backup.close();
        }
      } else if (category === "settings") {
        const value = await readSettings(file);
        if (
          !confirm(t("replace_your_settings_with_this_file_dictionaries_words"))
        )
          return;
        await restoreSettings(value);
        setSettings(value);
        await rpc({ action: "invalidate" });
        setNotice(t("settings_imported"));
      } else {
        const data = await readLearning(file);
        if (
          !confirm(
            t("replace_your_learning_data_with_words_reviews_and", {
              length: data.vocabulary.length,
              length1: data.reviews.length,
              length2: data.audio.length,
            }),
          )
        )
          return;
        await restoreLearning(data);
        sessionStorage.removeItem("last-review");
        await rpc({ action: "invalidate" });
        setNotice(t("learning_data_imported"));
      }
    });
  }
  async function fullExport() {
    await task(async () => {
      const { exportFull } = await import("@/backups/full");
      await exportFull(tasks.setProgress);
    });
  }
  async function cleanup() {
    await task(async () => {
      tasks.setProgress({ phase: t("cleanup_running"), done: 0, total: 0 });
      const result = await dictionariesClient({
        action: "cleanupDictionaries",
      });
      setNotice(
        result.records
          ? t("cleanup_complete", {
              records: number(result.records),
              revisions: number(result.revisions),
            })
          : t("cleanup_empty"),
      );
    });
  }
  return { busy, storageUsage, task, fileImport, fullExport, cleanup };
}
