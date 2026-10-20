import {
  languageIso3,
  languageName,
  morphologyLanguage,
} from "@/languages/codes";
import type { LanguageData } from "@/languages/hooks/useLanguageData";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { TaskProgress } from "@/shared/ui/TaskProgress";
import { Download, Upload } from "lucide-react";

export function LanguageDataSettings({
  settings,
  data,
  tasks,
}: {
  settings: Settings;
  data: LanguageData;
  tasks: SettingsTask;
}) {
  const { morphology, exampleCorpus, install: installLanguageData } = data;
  const { busy, progressTarget, progress, run: task } = tasks;
  return (
    <>
      <section className="settings-section" id="word-forms">
        <div className="section-heading">
          <h2>{t("word_forms")}</h2>
        </div>
        <div className="setting-row">
          <strong>
            {morphology.count
              ? t("word_forms_count", { count: morphology.count })
              : t("no_additional_word_forms_installed")}
          </strong>
          <button
            disabled={busy || !morphologyLanguage(settings.studyLanguage)}
            onClick={() => void task(() => installLanguageData("morphology"))}
          >
            <Download aria-hidden="true" />{" "}
            {morphology.count ? t("download_again") : t("download_word_forms")}
          </button>
        </div>
        {busy && progressTarget === "morphology" && progress && (
          <div className="setting-progress">
            <TaskProgress progress={progress} />
          </div>
        )}
        <div className="setting-footnote">
          {morphologyLanguage(settings.studyLanguage)
            ? t("extra_word_forms_from_simplemma_help_find_dictionary")
            : t("dictionary_word_forms_are_used_no_extra_simplemma")}
        </div>
      </section>
      <section className="settings-section" id="example-sentences">
        <div className="section-heading">
          <h2>{t("example_sentences")}</h2>
        </div>
        <div className="setting-row">
          <strong>
            {exampleCorpus.installed
              ? t("example_count", {
                  count: exampleCorpus.count,
                  language: languageName(settings.studyLanguage),
                })
              : t("no_examples_installed_for_this_study_language")}
          </strong>
          <div className="row">
            <button
              disabled={
                busy ||
                !settings.studyLanguage ||
                !languageIso3(settings.studyLanguage)
              }
              onClick={() => void task(() => installLanguageData("examples"))}
            >
              <Download aria-hidden="true" />
              {exampleCorpus.installed
                ? t("update_examples")
                : t("download_examples")}
            </button>
            <label
              className={`button ${busy || !settings.studyLanguage ? "disabled" : ""}`}
            >
              <Upload aria-hidden="true" /> {t("import_tsv")}{" "}
              <input
                type="file"
                accept=".tsv,.bz2"
                hidden
                disabled={busy || !settings.studyLanguage}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    void task(() => installLanguageData("examples", file));
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {busy && progressTarget === "examples" && progress && (
          <div className="setting-progress">
            <TaskProgress progress={progress} />
          </div>
        )}
        <div className="setting-footnote">
          {t("tatoeba_examples_for_your_study_language_are_stored")}{" "}
        </div>
      </section>
    </>
  );
}
