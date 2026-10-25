import { examplesClient } from "@/examples/client";
import { startImport } from "@/imports/client";
import { installedMorphology } from "@/languages/storage";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import { i18n, t } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";

export function useLanguageData(language: string, tasks: SettingsTask) {
  const { busy, setError, setProgressTarget, setProgress, setNotice } = tasks;
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
  async function installLanguageData(
    type: "examples" | "morphology",
    blob?: Blob,
    targetLanguage = language,
  ) {
    setProgressTarget(type);
    setProgress(undefined);
    if (!targetLanguage) throw new Error(t("choose_a_study_language_first"));
    await startImport({
      type,
      blob,
      language: targetLanguage,
      locale: i18n.language,
    });
    setNotice(
      type === "examples"
        ? t("example_sentences_saved")
        : t("word_forms_saved"),
    );
  }
  return { morphology, exampleCorpus, install: installLanguageData };
}
export type LanguageData = ReturnType<typeof useLanguageData>;
