import {
  Button,
  FileButton,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  languageIso3,
  languageName,
  morphologyLanguage,
} from "@/languages/codes";
import type { LanguageData } from "@/languages/hooks/useLanguageData";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
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
  const { busy, run: task } = tasks;
  return (
    <>
      <Paper id="word-forms">
        <Stack>
          <Title order={2}>{t("word_forms")}</Title>
          <Group align="center">
            <strong>
              {morphology.count
                ? t("word_forms_count", { count: morphology.count })
                : t("no_additional_word_forms_installed")}
            </strong>
            <Button
              disabled={busy || !morphologyLanguage(settings.studyLanguage)}
              onClick={() => void task(() => installLanguageData("morphology"))}
              variant="default"
            >
              <Download aria-hidden="true" size={16} />{" "}
              {morphology.count
                ? t("download_again")
                : t("download_word_forms")}
            </Button>
          </Group>
          <Text variant="supporting">
            {morphologyLanguage(settings.studyLanguage)
              ? t("extra_word_forms_from_simplemma_help_find_dictionary")
              : t("dictionary_word_forms_are_used_no_extra_simplemma")}
          </Text>
        </Stack>
      </Paper>
      <Paper id="example-sentences">
        <Stack>
          <Title order={2}>{t("example_sentences")}</Title>
          <Group align="center">
            <strong>
              {exampleCorpus.installed
                ? t("example_count", {
                    count: exampleCorpus.count,
                    language: languageName(settings.studyLanguage),
                  })
                : t("no_examples_installed_for_this_study_language")}
            </strong>
            <Group align="center">
              <Button
                disabled={
                  busy ||
                  !settings.studyLanguage ||
                  !languageIso3(settings.studyLanguage)
                }
                onClick={() => void task(() => installLanguageData("examples"))}
                variant="default"
              >
                <Download aria-hidden="true" size={16} />
                {exampleCorpus.installed
                  ? t("update_examples")
                  : t("download_examples")}
              </Button>
              <FileButton
                accept=".tsv,.bz2"
                disabled={busy || !settings.studyLanguage}
                onChange={(importedFile) => {
                  const file = importedFile ?? undefined;
                  if (file)
                    void task(() => installLanguageData("examples", file));
                }}
              >
                {(props) => (
                  <Button {...props} disabled={busy || !settings.studyLanguage}>
                    <Upload aria-hidden="true" size={16} />{" "}
                    {t("import_tsv")}{" "}
                  </Button>
                )}
              </FileButton>
            </Group>
          </Group>
          <Text variant="supporting">
            {t("tatoeba_examples_for_your_study_language_are_stored")}{" "}
          </Text>
        </Stack>
      </Paper>
    </>
  );
}
