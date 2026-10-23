import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Select,
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
import { SortableList } from "@/shared/ui/SortableList";
import {
  dictionaryDisplay,
  type DictionaryDisplay,
} from "@/dictionaries/display";
import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
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
  } = useDictionarySettings({
    settings,
    dictionaries,
    onChange: update,
    reload: load,
    tasks,
  });
  return (
    <Paper>
      <Stack>
        <Group align="center" justify="space-between">
          <Stack>
            <Title order={2}>{t("dictionaries")}</Title>
          </Stack>
          <Badge>
            {t("dictionaries_installed", {
              count: dictionaries.filter(
                (dictionary) => dictionary.id !== "nechybujte",
              ).length,
            })}
          </Badge>
        </Group>
        <SortableList
          items={dictionaries}
          getId={(dictionary) => dictionary.id}
          getLabel={(dictionary) => dictionary.index.title}
          onMove={moveDictionary}
          disabled={busy}
        >
          {(dictionary, handle) => (
            <Paper p="sm">
              <Stack>
                <Group justify="space-between" align="flex-start">
                  {handle}
                  <Stack miw={160} style={{ flex: 1 }}>
                    <strong>{dictionary.index.title}</strong>
                    <Text variant="supporting">
                      {dictionary.id === "nechybujte" ? (
                        t("nechybujte_online_help")
                      ) : (
                        <>
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
                        </>
                      )}
                    </Text>
                  </Stack>
                  <Select
                    w={120}
                    aria-label={t("dictionary_display", {
                      title: dictionary.index.title,
                    })}
                    value={
                      dictionary.enabled
                        ? dictionaryDisplay(dictionary.id, settings)
                        : "hide"
                    }
                    disabled={busy}
                    onChange={(value) =>
                      setDisplay(dictionary, value as DictionaryDisplay)
                    }
                    data={[
                      { value: "show", label: t("dictionary_show") },
                      { value: "fallback", label: t("dictionary_if_needed") },
                      { value: "hide", label: t("dictionary_hide") },
                    ]}
                  />
                </Group>
                <Group justify="flex-end">
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
                  {dictionary.id !== "nechybujte" && (
                    <>
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
                    </>
                  )}
                </Group>
              </Stack>
            </Paper>
          )}
        </SortableList>
        <Divider />
        <Text variant="supporting">{t("dictionary_display_help")}</Text>
        <Stack
          aria-busy={busy && progressTarget === "dictionary"}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void fileImport(event.dataTransfer.files[0]);
          }}
        >
          <Text>{t("drop_a_yomitan_format_3_zip")}</Text>
          <Group>
            <Button
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              variant="filled"
            >
              <Upload aria-hidden="true" size={16} />{" "}
              {busy ? t("working") : t("choose_zip")}
            </Button>
          </Group>
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
        <Stack>
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
      </Stack>
    </Paper>
  );
}
