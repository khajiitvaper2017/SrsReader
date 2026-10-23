import { examplesClient } from "@/examples/client";
import LanguageDataWorker from "@/languages/language-data.worker?worker";
import { installedMorphology } from "@/languages/storage";
import { rpc } from "@/platform/messaging/send";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import { i18n, t } from "@/shared/i18n/i18n";
import { useEffect, useRef, useState } from "react";

export function useLanguageData(language: string, tasks: SettingsTask) {
  const { busy, setError, setProgressTarget, setProgress, setNotice } = tasks;
  const worker = useRef<Worker | undefined>(undefined);
  const [morphology, setMorphology] = useState({ count: 0 });
  const [exampleCorpus, setExampleCorpus] = useState({
    count: 0,
    installed: false,
  });
  useEffect(() => {
    let alive = true;
    if (!language) {
      setMorphology({ count: 0 });
      setExampleCorpus({ count: 0, installed: false });
      return;
    }
    void installedMorphology(language).then((value) => {
      if (alive) setMorphology({ count: value?.count ?? 0 });
    });
    void examplesClient({ action: "exampleCorpus", language })
      .then((value) => {
        if (alive) setExampleCorpus(value);
      })
      .catch((error) => setError(error.message));
    return () => {
      alive = false;
    };
  }, [language, busy]);
  useEffect(() => () => worker.current?.terminate(), []);
  async function installLanguageData(
    type: "examples" | "morphology",
    blob?: Blob,
    targetLanguage = language,
  ) {
    setProgressTarget(type);
    setProgress(undefined);
    if (!targetLanguage) throw new Error(t("choose_a_study_language_first"));
    await new Promise<void>((resolve, reject) => {
      const current = new LanguageDataWorker();
      worker.current = current;
      current.onmessage = (event) => {
        if (event.data.progress) setProgress(event.data.progress);
        if (event.data.error || event.data.count !== undefined) {
          current.terminate();
          worker.current = undefined;
          if (event.data.error) reject(new Error(event.data.error));
          else resolve();
        }
      };
      current.onerror = (event) => {
        current.terminate();
        worker.current = undefined;
        reject(new Error(event.message || t("language_data_import_failed")));
      };
      current.postMessage({
        type,
        language: targetLanguage,
        blob,
        locale: i18n.language,
      });
    });
    await rpc({ action: "invalidate" });
    setNotice(
      type === "examples"
        ? t("example_sentences_saved")
        : t("word_forms_saved"),
    );
  }
  return { morphology, exampleCorpus, install: installLanguageData };
}
export type LanguageData = ReturnType<typeof useLanguageData>;
