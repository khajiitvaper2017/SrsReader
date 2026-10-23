import { dictionariesClient } from "@/dictionaries/client";
import ImportWorker from "@/dictionaries/import.worker?worker";
import { checkUpdate } from "@/dictionaries/management";
import type { Dictionary } from "@/dictionaries/model";
import { dictionaryArchive } from "@/dictionaries/storage";
import { rpc } from "@/platform/messaging/send";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { readDownload, saveBlob } from "@/shared/download";
import { i18n, t } from "@/shared/i18n/i18n";
import type { DictionaryDisplay } from "@/dictionaries/display";
import { useEffect, useRef, useState } from "react";

export function useDictionarySettings({
  settings,
  reload: load,
  tasks,
}: {
  settings: Settings;
  reload: () => void;
  tasks: SettingsTask;
}) {
  const {
    busy,
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
  function setDisplay(dictionary: Dictionary, display: DictionaryDisplay) {
    return void task(async () => {
      await dictionariesClient({
        action: "setDictionary",
        id: dictionary.id,
        display,
      });
      load();
    });
  }
  function moveDictionary(id: string, target: string) {
    return void task(async () => {
      await dictionariesClient({
        action: "moveDictionary",
        id,
        target,
      });
      load();
    });
  }
  function checkForUpdate(dictionary: Dictionary) {
    return void task(async () => {
      const result = await checkUpdate(dictionary);
      setUpdates((u) => ({ ...u, [dictionary.id]: result }));
      if (!result)
        setNotice(
          t("is_up_to_date", {
            title: dictionary.index.title,
          }),
        );
    });
  }
  function installUpdate(dictionary: Dictionary) {
    return void task(async () => {
      setProgressTarget("dictionary");
      const phase = t("downloading_dictionary", {
        title: dictionary.index.title,
      });
      setProgress({ phase, done: 0, total: 0 });
      const response = await fetch(updates[dictionary.id]!.url, {
        credentials: "omit",
      });
      if (!response.ok)
        throw new Error(
          t("dictionary_download_failed", {
            status: response.status,
          }),
        );
      const blob = await readDownload(response, phase, setProgress);
      await importZip(blob, dictionary.id);
      setUpdates((u) => ({ ...u, [dictionary.id]: null }));
    });
  }
  function exportDictionary(dictionary: Dictionary) {
    return void task(async () => {
      const archive = await dictionaryArchive(dictionary.revisionId);
      if (!archive) throw new Error(t("dictionary_archive_unavailable"));
      saveBlob(archive.blob, `${dictionary.index.title}.zip`);
    });
  }
  function removeDictionary(dictionary: Dictionary) {
    if (
      confirm(
        t("remove_your_saved_words_and_reviews_will_stay", {
          title: dictionary.index.title,
        }),
      )
    )
      void task(async () => {
        await dictionariesClient({
          action: "deleteDictionary",
          id: dictionary.id,
        });
        load();
      });
  }
  return {
    busy,
    progressTarget,
    updates,
    fileInput,
    downloadDictionary,
    fileImport,
    setDisplay,
    moveDictionary,
    checkForUpdate,
    installUpdate,
    exportDictionary,
    removeDictionary,
  };
}
