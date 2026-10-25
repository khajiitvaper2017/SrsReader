import { isOnlineDictionary } from "@/dictionaries/online";
import { ImmersionWeight } from "@/dictionaries/components/ImmersionWeight";
import { useState, type ReactNode } from "react";
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
  Tabs,
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
  type DictionaryRole,
} from "@/dictionaries/display";
import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
export function DictionarySettings({
  settings,
  dictionaries,
  reload: load,
  tasks,
  children,
}: {
  settings: Settings;
  dictionaries: Dictionary[];
  reload: () => void;
  tasks: SettingsTask;
  children?: ReactNode;
}) {
  const {
    busy,
    updateImmersionWeight,
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
    reload: load,
    tasks,
  });
  const [role, setRole] = useState<DictionaryRole>("vocabulary");
  const visible = dictionaries
    .filter(
      (dictionary) =>
        dictionary.language === settings.studyLanguage &&
        (role === "frequency"
          ? dictionary.frequencyCount > 0 || !!dictionary.immersion
          : dictionary.count > 0 || isOnlineDictionary(dictionary.id)),
    )
    .sort((a, b) =>
      role === "frequency"
        ? (settings.frequencyPreferences[a.id]?.order ?? a.order) -
          (settings.frequencyPreferences[b.id]?.order ?? b.order)
        : a.order - b.order,
    );
  const dictionaryControls = (
    <Stack>
      <SortableList
        items={visible}
        getId={(dictionary) => dictionary.id}
        getLabel={(dictionary) => dictionary.index.title}
        onMove={(id, target) => moveDictionary(id, target, role)}
        disabled={busy}
      >
        {(dictionary, handle) => (
          <Paper p="sm">
            <Group gap="sm" align="center">
              {handle}
              <Stack gap={0} miw={160} flex={1}>
                <strong>{dictionary.index.title}</strong>
                <Text variant="supporting">
                  {isOnlineDictionary(dictionary.id) ? (
                    t(`${dictionary.id}_online_help`)
                  ) : dictionary.immersion ? (
                    t("immersion_collection_help")
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
              <Group gap="xs" justify="flex-end">
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
                {!isOnlineDictionary(dictionary.id) && (
                  <>
                    <ActionIcon
                      title={t("export_zip")}
                      aria-label={t("export_zip")}
                      disabled={
                        busy ||
                        (!!dictionary.immersion && !dictionary.frequencyCount)
                      }
                      onClick={() => exportDictionary(dictionary)}
                      variant="subtle"
                    >
                      <Download aria-hidden="true" size={16} />
                    </ActionIcon>
                    {!dictionary.immersion && (
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
                    )}
                  </>
                )}
                <Select
                  w={120}
                  aria-label={t("dictionary_display", {
                    title: dictionary.index.title,
                  })}
                  value={
                    role === "frequency"
                      ? settings.frequencyPreferences[dictionary.id]
                          ?.enabled !== false
                        ? "show"
                        : "hide"
                      : dictionary.enabled
                        ? dictionaryDisplay(dictionary.id, settings)
                        : "hide"
                  }
                  disabled={busy}
                  onChange={(value) =>
                    setDisplay(dictionary, value as DictionaryDisplay, role)
                  }
                  data={
                    role === "frequency"
                      ? [
                          { value: "show", label: t("dictionary_enabled") },
                          { value: "hide", label: t("dictionary_disabled") },
                        ]
                      : [
                          { value: "show", label: t("dictionary_show") },
                          {
                            value: "fallback",
                            label: t("dictionary_if_needed"),
                          },
                          { value: "hide", label: t("dictionary_hide") },
                        ]
                  }
                />
              </Group>
            </Group>
            {dictionary.immersion && (
              <ImmersionWeight
                dictionary={dictionary}
                disabled={busy}
                onSave={(weight) =>
                  updateImmersionWeight(dictionary.language, weight)
                }
              />
            )}
          </Paper>
        )}
      </SortableList>
      <Divider />
      <Text variant="supporting">
        {t(
          role === "frequency"
            ? "frequency_enabled_help"
            : "dictionary_display_help",
        )}
      </Text>
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
    </Stack>
  );
  return (
    <Stack>
      <Paper>
        <Stack>
          <Group justify="space-between">
            <Title order={2}>{t("dictionaries")}</Title>
            <Badge>
              {t("dictionaries_installed", {
                count: visible.filter(
                  (dictionary) =>
                    !isOnlineDictionary(dictionary.id) && !dictionary.immersion,
                ).length,
              })}
            </Badge>
          </Group>
          <Tabs
            value={role}
            onChange={(value) => setRole(value as DictionaryRole)}
            keepMounted={false}
          >
            <Tabs.List mb="sm" aria-label={t("dictionary_types")}>
              <Tabs.Tab value="vocabulary">
                {t("vocabulary_dictionaries")}
              </Tabs.Tab>
              <Tabs.Tab value="frequency">
                {t("frequency_dictionaries")}
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="vocabulary">
              <Stack>
                {dictionaryControls}
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
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="frequency">
              <Stack>
                {dictionaryControls}
                <FrequencyBrowser
                  key={settings.studyLanguage}
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
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Paper>
      {role === "vocabulary" && children}
    </Stack>
  );
}
