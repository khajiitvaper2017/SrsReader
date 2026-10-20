import { exportLearning, exportSettings } from "@/backups/archive";
import { useBackups } from "@/backups/hooks/useBackups";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Download, Upload } from "lucide-react";

export function BackupSettings({
  setSettings,
  tasks,
}: {
  setSettings: (settings: Settings) => void;
  tasks: SettingsTask;
}) {
  const { busy, task, fileImport } = useBackups({ setSettings, tasks });

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
