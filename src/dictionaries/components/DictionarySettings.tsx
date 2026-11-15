import { isOnlineDictionary } from "@/dictionaries/online";
import type { ReactNode } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Divider,
  Flex,
  Group,
  Menu,
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
import {
  WikipediaBrowser,
  wikipediaDownloadUrl,
} from "@/dictionaries/components/WikipediaBrowser";
import { useDictionarySettings } from "@/dictionaries/hooks/useDictionarySettings";
import type { Dictionary } from "@/dictionaries/model";
import { languageLabel, languageName } from "@/languages/codes";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { SortableList } from "@/shared/ui/SortableList";
import {
  dictionaryDisplay,
  type DictionaryDisplay,
  type DictionaryRole,
} from "@/dictionaries/display";
import {
  Download,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
export function DictionarySettings({
  settings,
  dictionaries,
  reload: load,
  tasks,
  children,
  role,
  onRoleChange,
  withTitle,
}: {
  settings: Settings;
  dictionaries: Dictionary[];
  reload: () => void;
  tasks: SettingsTask;
  children?: ReactNode;
  role: DictionaryRole;
  onRoleChange: (role: DictionaryRole) => void;
  withTitle: boolean;
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
    reload: load,
    tasks,
  });
  const visible = dictionaries
    .filter(
      (dictionary) =>
        dictionary.language === settings.studyLanguage &&
        (role === "frequency"
          ? dictionary.frequencyCount > 0
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
        {(dictionary, controls) => (
          <Group gap="xs" align="center" wrap="nowrap">
            {controls}
            <Flex
              direction={{ base: "column", sm: "row" }}
              align={{ base: "stretch", sm: "center" }}
              gap="xs"
              flex={1}
              miw={0}
            >
              <Stack gap={0} miw={0} flex={1}>
                <strong
                  title={t("dictionary_revision", {
                    revision: dictionary.index.revision,
                  })}
                >
                  {dictionary.index.title}
                </strong>
                <Text variant="supporting">
                  {isOnlineDictionary(dictionary.id) ? (
                    t(`${dictionary.id}_online_help`)
                  ) : (
                    <>
                      {dictionary.count > 0
                        ? t("dictionary_entries", {
                            target: dictionary.target
                              ? languageLabel(dictionary.target)
                              : t("unspecified"),
                            count: dictionary.count,
                          })
                        : languageLabel(dictionary.language)}
                      {dictionary.frequencyCount > 0 &&
                        t("frequency_count", {
                          count: dictionary.frequencyCount,
                        })}
                    </>
                  )}
                </Text>
              </Stack>
              <Group
                gap={4}
                justify="space-between"
                wrap="nowrap"
                w={{ base: "100%", sm: "auto" }}
              >
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
                <Select
                  w={{ base: 0, sm: 160 }}
                  flex={{ base: 1, sm: "0 0 auto" }}
                  miw={0}
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
                {(dictionary.index.isUpdatable ||
                  !isOnlineDictionary(dictionary.id)) && (
                  <Menu>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        aria-label={t("actions")}
                        disabled={busy}
                      >
                        <MoreHorizontal aria-hidden="true" size={20} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {dictionary.index.isUpdatable && (
                        <Menu.Item
                          disabled={busy}
                          onClick={() => checkForUpdate(dictionary)}
                          leftSection={
                            <RefreshCw aria-hidden="true" size={16} />
                          }
                        >
                          {t("check_updates")}
                        </Menu.Item>
                      )}
                      {!isOnlineDictionary(dictionary.id) && (
                        <>
                          <Menu.Item
                            disabled={busy}
                            onClick={() => exportDictionary(dictionary)}
                            leftSection={
                              <Download aria-hidden="true" size={16} />
                            }
                          >
                            {t("export_zip")}
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            disabled={busy}
                            onClick={() => removeDictionary(dictionary)}
                            leftSection={
                              <Trash2 aria-hidden="true" size={16} />
                            }
                          >
                            {t("remove")}
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Group>
            </Flex>
          </Group>
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
      <Stack
        aria-busy={busy && progressTarget === "dictionary"}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void fileImport(event.dataTransfer.files[0]);
        }}
      >
        {withTitle && <Title order={2}>{t("dictionaries")}</Title>}
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
        <Tabs
          value={role}
          onChange={(value) => onRoleChange(value as DictionaryRole)}
          keepMounted={false}
        >
          <Group justify="space-between" mb="sm">
            <Tabs.List aria-label={t("dictionary_types")}>
              <Tabs.Tab value="vocabulary">
                {t("vocabulary_dictionaries")}
              </Tabs.Tab>
              <Tabs.Tab value="frequency">
                {t("frequency_dictionary_type")}
              </Tabs.Tab>
            </Tabs.List>
            <Group gap="xs">
              <Badge>
                {t("dictionaries_installed", {
                  count: visible.filter(
                    (dictionary) => !isOnlineDictionary(dictionary.id),
                  ).length,
                })}
              </Badge>
              <Button
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                variant="filled"
              >
                <Upload aria-hidden="true" size={16} />{" "}
                {busy ? t("working") : t("choose_zip")}
              </Button>
            </Group>
          </Group>
          <Tabs.Panel value="vocabulary">
            <Stack>
              {dictionaryControls}
              <WiktionaryBrowser
                key={`${settings.studyLanguage}:${JSON.stringify(settings.nativeLanguages)}`}
                language={settings.studyLanguage}
                nativeLanguages={settings.nativeLanguages}
                busy={busy}
                onImport={(entry) =>
                  downloadDictionary(
                    wiktionaryDownloadUrl(entry),
                    entry.source,
                    wiktionaryName(entry),
                  )
                }
              />
              <WikipediaBrowser
                key={settings.studyLanguage}
                language={settings.studyLanguage}
                busy={busy}
                onImport={(entry) =>
                  downloadDictionary(
                    wikipediaDownloadUrl(entry.file),
                    entry.code,
                    `${t("corpus_wikipedia")} · ${languageName(entry.code)}`,
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
      {role === "vocabulary" && children}
    </Stack>
  );
}
