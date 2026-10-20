import { readLearning, readSettings } from "@/backups/archive";
import { restoreLearning, restoreSettings } from "@/backups/restore";
import { rpc } from "@/platform/messaging/send";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";

export function useBackups({
  setSettings,
  tasks,
}: {
  setSettings: (settings: Settings) => void;
  tasks: SettingsTask;
}) {
  const { busy, setNotice, run: task } = tasks;
  async function fileImport(
    file: File | undefined,
    category: "settings" | "learning",
  ) {
    if (!file || busy) return;
    await task(async () => {
      if (category === "settings") {
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
  return { busy, task, fileImport };
}
