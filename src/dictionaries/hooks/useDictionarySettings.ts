import { exportImmersionDictionary } from "@/dictionaries/immersion";
import { dictionariesClient } from "@/dictionaries/client";
import { startImport } from "@/imports/client";
import { checkUpdate } from "@/dictionaries/management";
import type { Dictionary } from "@/dictionaries/model";
import { dictionaryArchive } from "@/dictionaries/storage";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { saveBlob } from "@/shared/download";
import { i18n, t } from "@/shared/i18n/i18n";
import type { DictionaryDisplay, DictionaryRole } from "@/dictionaries/display";
import { useRef, useState } from "react";

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
    setNotice,
    run: task,
  } = tasks;
  const [updates, setUpdates] = useState<
    Record<string, { revision: string; url: string } | null>
  >({});
  const fileInput = useRef<HTMLInputElement>(null);
  async function importZip(
    blob: Blob,
    expectedId?: string,
    language: string = settings.studyLanguage,
  ) {
    setProgressTarget("dictionary");
    await startImport({
      type: "dictionary",
      blob,
      language,
      expectedId,
      locale: i18n.language,
    });
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
      await startImport({
        type: "dictionary",
        url,
        language,
        title,
        locale: i18n.language,
      });
      load();
    });
  }
  async function fileImport(file: File | undefined) {
    if (!file || busy) return;
    await task(() => importZip(file));
  }
  function setDisplay(
    dictionary: Dictionary,
    display: DictionaryDisplay,
    role: DictionaryRole,
  ) {
    return void task(async () => {
      await dictionariesClient({
        action: "setDictionary",
        role,
        id: dictionary.id,
        display,
      });
      load();
    });
  }
  function moveDictionary(id: string, target: string, role: DictionaryRole) {
    return void task(async () => {
      await dictionariesClient({
        action: "moveDictionary",
        role,
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
      await startImport({
        type: "dictionary",
        url: updates[dictionary.id]!.url,
        language: settings.studyLanguage,
        title: dictionary.index.title,
        expectedId: dictionary.id,
        locale: i18n.language,
      });
      load();
      setUpdates((u) => ({ ...u, [dictionary.id]: null }));
    });
  }
  function exportDictionary(dictionary: Dictionary) {
    return void task(async () => {
      if (dictionary.immersion) {
        saveBlob(
          await exportImmersionDictionary(dictionary),
          `${dictionary.index.title}.zip`,
        );
        return;
      }
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
  function updateImmersionWeight(language: string, weight: number) {
    return void task(async () => {
      await dictionariesClient({
        action: "setImmersionWeight",
        language,
        weight,
      });
      load();
    });
  }
  return {
    updateImmersionWeight,
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
