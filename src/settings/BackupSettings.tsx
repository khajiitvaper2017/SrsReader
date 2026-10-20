import {
  exportLearning,
  exportSettings,
  readLearning,
  readSettings,
} from "@/backups/archive";
import { restoreLearning, restoreSettings } from "@/backups/restore";
import { rpc } from "@/platform/messaging/send";
import type { Settings } from "@/settings/model";
import type { SettingsTask } from "@/settings/useSettingsTask";
import { t } from "@/shared/i18n/i18n";
import { Download, Upload } from "lucide-react";
export function BackupSettings({
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
  return (
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>{t("import_export")}</h2>
        </div>
      </div>
      <div className="backup-grid">
        <div>
          <h3>{t("settings")}</h3>
          <div className="row">
            <button disabled={busy} onClick={() => void task(exportSettings)}>
              <Download aria-hidden="true" /> {t("export_json")}{" "}
            </button>
            <label className={`button ${busy ? "disabled" : ""}`}>
              <Upload aria-hidden="true" /> {t("import_json")}{" "}
              <input
                type="file"
                accept=".json"
                hidden
                disabled={busy}
                onChange={(event) => {
                  void fileImport(event.target.files?.[0], "settings");
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <div>
          <h3>{t("words_progress")}</h3>
          <p>{t("includes_sentences_review_history_and_saved_audio")}</p>
          <div className="row">
            <button disabled={busy} onClick={() => void task(exportLearning)}>
              <Download aria-hidden="true" /> {t("export_zip")}{" "}
            </button>
            <label className={`button ${busy ? "disabled" : ""}`}>
              <Upload aria-hidden="true" /> {t("import_zip")}{" "}
              <input
                type="file"
                accept=".zip"
                hidden
                disabled={busy}
                onChange={(event) => {
                  void fileImport(event.target.files?.[0], "learning");
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>
      <div className="setting-footnote">
        {t("imports_replace_the_selected_category_export_your_progress")}{" "}
      </div>
    </section>
  );
}
