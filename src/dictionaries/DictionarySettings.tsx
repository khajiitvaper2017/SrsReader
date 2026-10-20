import {
  FrequencyBrowser,
  frequencyDownloadUrl,
} from "@/dictionaries/FrequencyBrowser";
import {
  WiktionaryBrowser,
  wiktionaryDownloadUrl,
  wiktionaryName,
} from "@/dictionaries/WiktionaryBrowser";
import ImportWorker from "@/dictionaries/import.worker?worker";
import { checkUpdate } from "@/dictionaries/management";
import type { Dictionary } from "@/dictionaries/model";
import { languageName } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import type { SettingsTask } from "@/settings/useSettingsTask";
import { db } from "@/shared/db";
import { readDownload, saveBlob } from "@/shared/download";
import { i18n, t } from "@/shared/i18n/i18n";
import { rpc } from "@/shared/rpc";
import { TaskProgress } from "@/shared/ui/TaskProgress";
import {
  ArrowDown,
  ArrowUp,
  Download,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
    setProgressTarget,
    setProgress,
    setNotice,
    run: task,
  } = tasks;
  const [updates, setUpdates] = useState<
    Record<string, { revision: string; url: string } | null>
  >({});
  const worker = useRef<Worker | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  async function importZip(
    blob: Blob,
    expectedId?: string,
    language: string = settings.studyLanguage,
  ) {
    setProgressTarget("dictionary");
    setProgress({ phase: t("importing"), done: 0, total: 0 });
    await new Promise<void>((resolve, reject) => {
      const current = new ImportWorker();
      worker.current = current;
      current.onmessage = (event) => {
        if (event.data.progress) setProgress(event.data.progress);
        if (event.data.error || event.data.dictionary) {
          current.terminate();
          worker.current = undefined;
          if (event.data.error) reject(new Error(event.data.error));
          else resolve();
        }
      };
      current.onerror = (event) => {
        current.terminate();
        worker.current = undefined;
        reject(new Error(event.message || t("dictionary_import_failed")));
      };
      current.postMessage({
        blob,
        language,
        expectedId,
        locale: i18n.language,
      });
    });
    await rpc({ action: "invalidate" });
    load();
    setNotice(t("dictionary_imported"));
  }
  async function downloadDictionary(
    url: string,
    language: string,
    title: string,
  ) {
    await task(async () => {
      setProgressTarget("dictionary");
      setProgress({
        phase: t("downloading_dictionary", { title }),
        done: 0,
        total: 0,
      });
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok)
        throw new Error(
          t("dictionary_download_failed", { status: response.status }),
        );
      const blob = await readDownload(
        response,
        t("downloading_dictionary", { title }),
        setProgress,
      );
      await importZip(blob, undefined, language);
    });
  }
  async function fileImport(file: File | undefined) {
    if (!file || busy) return;
    await task(() => importZip(file));
  }
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
                onChange={(event) =>
                  void task(async () => {
                    await rpc({
                      action: "setDictionary",
                      id: dictionary.id,
                      enabled: event.target.checked,
                    });
                    load();
                  })
                }
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
                onClick={() =>
                  void task(async () => {
                    await rpc({
                      action: "moveDictionary",
                      id: dictionary.id,
                      direction: "up",
                    });
                    load();
                  })
                }
              >
                <ArrowUp aria-hidden="true" />
              </button>
              <button
                className="quiet icon-button"
                disabled={busy || i === dictionaries.length - 1}
                title={t("move_dictionary_down")}
                aria-label={t("move_dictionary_down")}
                onClick={() =>
                  void task(async () => {
                    await rpc({
                      action: "moveDictionary",
                      id: dictionary.id,
                      direction: "down",
                    });
                    load();
                  })
                }
              >
                <ArrowDown aria-hidden="true" />
              </button>
              {dictionary.index.isUpdatable && (
                <button
                  title={t("check_updates")}
                  aria-label={t("check_updates")}
                  className="quiet icon-button"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      const result = await checkUpdate(dictionary);
                      setUpdates((u) => ({ ...u, [dictionary.id]: result }));
                      if (!result)
                        setNotice(
                          t("is_up_to_date", {
                            title: dictionary.index.title,
                          }),
                        );
                    })
                  }
                >
                  <RefreshCw aria-hidden="true" />
                </button>
              )}
              {updates[dictionary.id] && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      setProgressTarget("dictionary");
                      const phase = t("downloading_dictionary", {
                        title: dictionary.index.title,
                      });
                      setProgress({ phase, done: 0, total: 0 });
                      const response = await fetch(
                        updates[dictionary.id]!.url,
                        { credentials: "omit" },
                      );
                      if (!response.ok)
                        throw new Error(
                          t("dictionary_download_failed", {
                            status: response.status,
                          }),
                        );
                      const blob = await readDownload(
                        response,
                        phase,
                        setProgress,
                      );
                      await importZip(blob, dictionary.id);
                      setUpdates((u) => ({ ...u, [dictionary.id]: null }));
                    })
                  }
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
                onClick={() =>
                  void task(async () => {
                    const archive = await db.archives.get(
                      dictionary.revisionId,
                    );
                    if (!archive)
                      throw new Error(t("dictionary_archive_unavailable"));
                    saveBlob(archive.blob, `${dictionary.index.title}.zip`);
                  })
                }
              >
                <Download aria-hidden="true" />
              </button>
              <button
                title={t("remove")}
                aria-label={t("remove")}
                className="quiet danger icon-button"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      t("remove_your_saved_words_and_reviews_will_stay", {
                        title: dictionary.index.title,
                      }),
                    )
                  )
                    void task(async () => {
                      await rpc({
                        action: "deleteDictionary",
                        id: dictionary.id,
                      });
                      load();
                    });
                }}
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
