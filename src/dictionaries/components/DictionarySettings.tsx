import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
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
    <Paper mb="md">
      <Stack gap="md">
        <Group gap="xs" align="center" justify="space-between">
          <Stack gap="xs">
            <Title order={2}>{t("dictionaries")}</Title>
          </Stack>
          <Badge>
            {t("dictionaries_installed", { count: dictionaries.length })}
          </Badge>
        </Group>
        {settings.studyLanguage === "cs" && (
          <Switch
            checked={settings.nechybujte}
            onChange={(event) =>
              void update({ nechybujte: event.target.checked })
            }
            aria-label={t("nechybujte_online")}
            label={
              <span>
                <strong>{t("nechybujte_online")}</strong>
                <Text component="small" size="xs" c="dimmed" display="block">
                  {t("nechybujte_online_help")}
                </Text>
              </span>
            }
          />
        )}
        <Stack
          aria-busy={busy && progressTarget === "dictionary"}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void fileImport(event.dataTransfer.files[0]);
          }}
          gap="xs"
        >
          <Stack gap="xs">
            {busy && progressTarget === "dictionary" && progress ? (
              <TaskProgress progress={progress} />
            ) : (
              <strong>{t("drop_a_yomitan_format_3_zip")}</strong>
            )}
          </Stack>
          <Button
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            variant="filled"
          >
            <Upload aria-hidden="true" size={16} />{" "}
            {busy ? t("working") : t("choose_zip")}
          </Button>
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
        </Stack>
        <Stack gap="xs">
          <Anchor
            href="https://yomitan.wiki/dictionaries/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("find_dictionaries")}{" "}
          </Anchor>
        </Stack>
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
        <Stack gap="xs">
          {dictionaries.map((dictionary, i) => (
            <Group
              key={dictionary.id}
              gap="xs"
              align="center"
              justify="space-between"
            >
              <Checkbox
                checked={dictionary.enabled}
                disabled={busy}
                onChange={(event) => setEnabled(dictionary, event)}
                aria-label={dictionary.index.title}
                label={
                  <span>
                    <strong>{dictionary.index.title}</strong>
                    <Text
                      component="small"
                      size="xs"
                      c="dimmed"
                      display="block"
                    >
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
                    </Text>
                  </span>
                }
              />
              <Group gap="xs" align="center">
                <ActionIcon
                  disabled={busy || i === 0}
                  title={t("move_dictionary_up")}
                  aria-label={t("move_dictionary_up")}
                  onClick={() => moveUp(dictionary)}
                  variant="subtle"
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </ActionIcon>
                <ActionIcon
                  disabled={busy || i === dictionaries.length - 1}
                  title={t("move_dictionary_down")}
                  aria-label={t("move_dictionary_down")}
                  onClick={() => moveDown(dictionary)}
                  variant="subtle"
                >
                  <ArrowDown aria-hidden="true" size={16} />
                </ActionIcon>
                {dictionary.index.isUpdatable && (
                  <ActionIcon
                    title={t("check_updates")}
                    aria-label={t("check_updates")}
                    disabled={busy}
                    onClick={() => checkForUpdate(dictionary)}
                    variant="subtle"
                  >
                    <RefreshCw aria-hidden="true" size={16} />
                  </ActionIcon>
                )}
                {updates[dictionary.id] && (
                  <Button
                    disabled={busy}
                    onClick={() => installUpdate(dictionary)}
                    variant="filled"
                  >
                    <Download aria-hidden="true" size={16} />{" "}
                    {t("update_dictionary_revision", {
                      revision: updates[dictionary.id]!.revision,
                    })}
                  </Button>
                )}
                <ActionIcon
                  title={t("export_zip")}
                  aria-label={t("export_zip")}
                  disabled={busy}
                  onClick={() => exportDictionary(dictionary)}
                  variant="subtle"
                >
                  <Download aria-hidden="true" size={16} />
                </ActionIcon>
                <ActionIcon
                  title={t("remove")}
                  aria-label={t("remove")}
                  disabled={busy}
                  onClick={() => removeDictionary(dictionary)}
                  variant="subtle"
                  color="red"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
