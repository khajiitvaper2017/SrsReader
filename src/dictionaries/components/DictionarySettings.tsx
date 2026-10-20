import {
  FrequencyBrowser,
  frequencyDownloadUrl,
} from "@/dictionaries/components/FrequencyBrowser";
import {
  WiktionaryBrowser,
  wiktionaryDownloadUrl,
  wiktionaryName,
} from "@/dictionaries/components/WiktionaryBrowser";
import { useDictionarySettings } from "@/dictionaries/hooks/useDictionarySettings";
import type { Dictionary } from "@/dictionaries/model";
import { languageName } from "@/languages/codes";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { TaskProgress } from "@/shared/ui/TaskProgress";
import {
  ArrowDown,
  ArrowUp,
  Download,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
export function DictionarySettings({
  settings,
  dictionaries,
  onChange: update,
  reload: load,
  tasks,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  dictionaries: Dictionary[];
  reload: () => void;
  tasks: SettingsTask;
}) {
  const {
    busy,
    progress,
    progressTarget,
    updates,
    fileInput,
    downloadDictionary,
    fileImport,
    setEnabled,
    moveUp,
    moveDown,
    checkForUpdate,
    installUpdate,
    exportDictionary,
    removeDictionary,
  } = useDictionarySettings({
    settings,
    dictionaries,
    onChange: update,
    reload: load,
    tasks,
  });

  return (
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>{t("dictionaries")}</h2>
        </div>
        <span className="count-pill">
          {t("dictionaries_installed", { count: dictionaries.length })}
        </span>
      </div>
      {settings.studyLanguage === "cs" && (
        <label className="setting-row">
          <span>
            <strong>{t("nechybujte_online")}</strong>
            <small>{t("nechybujte_online_help")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.nechybujte}
            onChange={(event) =>
              void update({ nechybujte: event.target.checked })
            }
          />
        </label>
      )}
      <div
        className="import-zone"
        aria-busy={busy && progressTarget === "dictionary"}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void fileImport(event.dataTransfer.files[0]);
        }}
      >
        <div>
          {busy && progressTarget === "dictionary" && progress ? (
            <TaskProgress progress={progress} />
          ) : (
            <strong>{t("drop_a_yomitan_format_3_zip")}</strong>
          )}
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden="true" /> {busy ? t("working") : t("choose_zip")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip"
          hidden
          onChange={(event) => {
            void fileImport(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <div className="starter-note">
        <a
          href="https://yomitan.wiki/dictionaries/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("find_dictionaries")}{" "}
        </a>
      </div>
      <WiktionaryBrowser
        key={`${settings.studyLanguage}:${settings.nativeLanguage}`}
        language={settings.studyLanguage}
        nativeLanguage={settings.nativeLanguage}
        busy={busy}
        onImport={(entry) =>
          downloadDictionary(
            wiktionaryDownloadUrl(entry),
            entry.source,
            wiktionaryName(entry),
          )
        }
      />
      <FrequencyBrowser
        language={settings.studyLanguage}
        busy={busy}
        onImport={(entry) =>
          downloadDictionary(
            frequencyDownloadUrl(entry.file),
            entry.code,
            `${languageName(entry.code)} ${entry.source}`,
          )
        }
      />
      <div className="dictionary-list">
        {dictionaries.map((dictionary, i) => (
          <div className="dictionary-row" key={dictionary.id}>
            <label className="dictionary-toggle">
              <input
                type="checkbox"
                checked={dictionary.enabled}
                disabled={busy}
                onChange={(event) => setEnabled(dictionary, event)}
              />
              <span>
                <strong>{dictionary.index.title}</strong>
                <small>
                  {dictionary.count > 0
                    ? t("dictionary_entries", {
                        language: dictionary.language,
                        target: dictionary.target || t("unspecified"),
                        count: dictionary.count,
                      })
                    : dictionary.language}
                  {dictionary.frequencyCount > 0 &&
                    t("frequency_count", {
                      count: dictionary.frequencyCount,
                    })}
                  {" · "}
                  {t("dictionary_revision", {
                    revision: dictionary.index.revision,
                  })}
                </small>
              </span>
            </label>
            <div className="dictionary-actions">
              <button
                className="quiet icon-button"
                disabled={busy || i === 0}
                title={t("move_dictionary_up")}
                aria-label={t("move_dictionary_up")}
                onClick={() => moveUp(dictionary)}
              >
                <ArrowUp aria-hidden="true" />
              </button>
              <button
                className="quiet icon-button"
                disabled={busy || i === dictionaries.length - 1}
                title={t("move_dictionary_down")}
                aria-label={t("move_dictionary_down")}
                onClick={() => moveDown(dictionary)}
              >
                <ArrowDown aria-hidden="true" />
              </button>
              {dictionary.index.isUpdatable && (
                <button
                  title={t("check_updates")}
                  aria-label={t("check_updates")}
                  className="quiet icon-button"
                  disabled={busy}
                  onClick={() => checkForUpdate(dictionary)}
                >
                  <RefreshCw aria-hidden="true" />
                </button>
              )}
              {updates[dictionary.id] && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => installUpdate(dictionary)}
                >
                  <Download aria-hidden="true" />{" "}
                  {t("update_dictionary_revision", {
                    revision: updates[dictionary.id]!.revision,
                  })}
                </button>
              )}
              <button
                title={t("export_zip")}
                aria-label={t("export_zip")}
                className="quiet icon-button"
                disabled={busy}
                onClick={() => exportDictionary(dictionary)}
              >
                <Download aria-hidden="true" />
              </button>
              <button
                title={t("remove")}
                aria-label={t("remove")}
                className="quiet danger icon-button"
                disabled={busy}
                onClick={() => removeDictionary(dictionary)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
