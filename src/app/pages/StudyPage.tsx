import { AnkiTransfer } from "@/anki/components/AnkiTransfer";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  NavLink,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { dictionariesClient } from "@/dictionaries/client";
import type { Dictionary } from "@/dictionaries/model";
import { languageLabel, languageName } from "@/languages/codes";
import { LanguageSelect } from "@/languages/components/LanguageSelect";
import { settingsClient } from "@/settings/client";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { number, t } from "@/shared/i18n/i18n";
import { TaskAlerts } from "@/shared/ui/TaskAlerts";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { srsClient } from "@/srs/client";
import { DeckEditor } from "@/srs/components/DeckEditor";
import { deckPathLabel } from "@/srs/deck-tree";
import { ReviewStatistics } from "@/srs/components/ReviewStatistics";
import type { Responses } from "@/srs/contracts";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  CalendarClock,
  Eraser,
  List,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type DeckAction = {
  language: string;
  deckId: string;
  name: string;
  operation: "refresh" | "clear" | "delete" | "reschedule";
};

export function StudyPage({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}) {
  const [languages, setLanguages] = useState<Responses["studyOverview"]>();
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"language" | "deck" | null>(null);
  const [deckEditor, setDeckEditor] = useState<{
    language: string;
    id?: string;
    parentId: string | null;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<DeckAction | null>(null);
  const [language, setLanguage] = useState(settings.studyLanguage);
  const [dictionaryId, setDictionaryId] = useState("");
  const [limit, setLimit] = useState<string | number>(1000);
  const [name, setName] = useState("");
  const load = useCallback(() => {
    void Promise.all([
      srsClient({ action: "studyOverview" }),
      dictionariesClient({ action: "dictionaries" }),
    ])
      .then(([overview, rows]) => {
        setLanguages(overview);
        setDictionaries(rows);
      })
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
  useChanges(load, [
    "vocabulary",
    "srs",
    "settings",
    "dictionaries",
    "collection",
  ]);
  const sources = dictionaries.filter(
    (dictionary) =>
      settings.frequencyPreferences[dictionary.id]?.enabled !== false &&
      dictionary.language === language &&
      dictionary.frequencyCount > 0,
  );
  const source =
    sources.find((dictionary) => dictionary.id === dictionaryId) || sources[0];
  async function start(language: string, deckId?: string) {
    location.hash = `review/session/${language}${deckId ? `/${encodeURIComponent(deckId)}` : ""}`;
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (modal === "language") {
        setSettings(
          await settingsClient({
            action: "setSettings",
            value: {
              ...settings,
              studyLanguages: [
                ...new Set([...settings.studyLanguages, language]),
              ],
            },
          }),
        );
      } else if (source) {
        await srsClient({
          action: "createFrequencyDeck",
          dictionaryId: source.id,
          limit: Number(limit),
          name:
            name.trim() ||
            t("frequency_deck_default_name", {
              dictionary: source.index.title,
              count: Number(limit),
            }),
        });
      }
      setModal(null);
      load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function manageDeck(action: DeckAction | null) {
    if (!action) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let rescheduled = 0;
      if (action.operation === "reschedule") {
        let after = "";
        while (true) {
          const result = await srsClient({
            action: "reschedule",
            language: action.language,
            deckId: action.deckId,
            after,
          });
          rescheduled += result.count;
          if (result.cursor === null) break;
          after = result.cursor;
        }
      } else {
        await srsClient({
          action: "manageDeck",
          language: action.language,
          deckId: action.deckId,
          operation: action.operation,
        });
      }
      setConfirmation(null);
      setNotice(
        action.operation === "refresh"
          ? t("study_deck_refreshed", { name: action.name })
          : action.operation === "reschedule"
            ? t("study_deck_rescheduled", { count: rescheduled })
            : "",
      );
      load();
    } catch (error) {
      setNotice("");
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = languages?.map((row) => (
    <StudyRows
      key={row.language}
      row={row}
      busy={busy}
      start={start}
      edit={(id, parentId) =>
        setDeckEditor({ language: row.language, id, parentId })
      }
      manage={(action) => {
        if (action.operation === "refresh") void manageDeck(action);
        else setConfirmation(action);
      }}
    />
  ));
  return (
    <Stack>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Title order={1}>{t("study_languages")}</Title>
        <Group gap="xs" wrap="nowrap">
          <Menu>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label={t("add")}
                disabled={busy}
              >
                <Plus aria-hidden size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                onClick={() => {
                  setLanguage(settings.studyLanguage);
                  setModal("language");
                }}
              >
                {t("study_add_language")}
              </Menu.Item>
              <Menu.Item
                leftSection={<FolderPlus size={16} />}
                onClick={() => {
                  setError("");
                  setDeckEditor({
                    language: settings.studyLanguage,
                    parentId: null,
                  });
                }}
              >
                {t("study_add_deck")}
              </Menu.Item>
              <Menu.Item
                onClick={() => {
                  setLanguage(settings.studyLanguage);
                  setName("");
                  setModal("deck");
                }}
              >
                {t("frequency_deck_add")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <AnkiTransfer settings={settings} onComplete={load} />
        </Group>
      </Group>
      <TaskAlerts
        busy={busy}
        error={modal || confirmation ? "" : error}
        notice={notice}
        onDismissError={() => setError("")}
        onDismissNotice={() => setNotice("")}
      />
      {languages && (
        <Box>
          <Table
            aria-label={t("study_language_deck")}
            layout="fixed"
            horizontalSpacing={0}
            verticalSpacing={0}
            tabularNums
            withRowBorders={false}
            highlightOnHover
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th p={0}>
                  <VisuallyHidden>{t("study_language_deck")}</VisuallyHidden>
                </Table.Th>
                <Table.Th p={0} w="3.5rem">
                  <VisuallyHidden>{t("new")}</VisuallyHidden>
                </Table.Th>
                <Table.Th p={0} w="3.5rem">
                  <VisuallyHidden>{t("srs_queue_learning")}</VisuallyHidden>
                </Table.Th>
                <Table.Th p={0} w="3.5rem">
                  <VisuallyHidden>{t("due")}</VisuallyHidden>
                </Table.Th>
                <Table.Th p={0} w="2.75rem">
                  <VisuallyHidden>{t("study_deck_actions")}</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
          </Table>
          <Text variant="supporting" mt="xs">
            {t("study_overview_help")}
          </Text>
        </Box>
      )}
      <ReviewStatistics />
      {deckEditor && languages && (
        <DeckEditor
          selection={deckEditor}
          overview={languages}
          onClose={() => setDeckEditor(null)}
          onSaved={() => {
            setDeckEditor(null);
            load();
          }}
        />
      )}
      <Modal
        opened={modal !== null}
        onClose={() => {
          if (!busy) setModal(null);
        }}
        title={t(
          modal === "language" ? "study_add_language" : "frequency_deck_add",
        )}
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <ErrorBox error={error} />
          {modal === "language" ? (
            <LanguageSelect
              label={t("language")}
              value={language}
              onChange={setLanguage}
              disabled={busy}
            />
          ) : (
            <Select
              label={t("language")}
              value={language}
              data={settings.studyLanguages.map((value) => ({
                value,
                label: languageLabel(value),
              }))}
              onChange={(value) => {
                if (value) setLanguage(value);
              }}
              disabled={busy}
            />
          )}
          {modal === "deck" && (
            <>
              <Select
                label={t("frequency_deck_dictionary")}
                data={sources.map((dictionary) => ({
                  value: dictionary.id,
                  label: dictionary.index.title,
                }))}
                value={source?.id || null}
                onChange={(value) => setDictionaryId(value || "")}
                nothingFoundMessage={t("frequency_deck_dictionary_missing")}
                disabled={busy || !sources.length}
              />
              {!sources.length && (
                <Text variant="supporting">
                  {t("frequency_deck_dictionary_missing")}
                </Text>
              )}
              <NumberInput
                label={t("frequency_deck_count")}
                min={1}
                max={10000}
                value={limit}
                onChange={setLimit}
                disabled={busy}
              />
              <TextInput
                label={t("frequency_deck_name")}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={200}
                disabled={busy}
              />
              <Text variant="supporting">{t("frequency_deck_help")}</Text>
            </>
          )}
          <Group justify="flex-end">
            <Button
              onClick={() => void submit()}
              variant="filled"
              loading={busy}
              disabled={
                !language ||
                (modal === "deck" &&
                  (!source ||
                    !Number.isInteger(Number(limit)) ||
                    Number(limit) < 1 ||
                    Number(limit) > 10000))
              }
            >
              {t(
                modal === "language"
                  ? "study_add_language"
                  : "frequency_deck_add",
              )}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={confirmation !== null}
        onClose={() => {
          if (!busy) setConfirmation(null);
        }}
        title={t(
          confirmation?.operation === "reschedule"
            ? "study_reschedule_deck_title"
            : confirmation?.operation === "delete"
              ? "study_delete_deck_title"
              : "study_clear_deck_title",
          { name: confirmation?.name },
        )}
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <ErrorBox error={error} />
          <Text>
            {t(
              confirmation?.operation === "reschedule"
                ? "study_reschedule_deck_confirm"
                : confirmation?.operation === "delete"
                  ? "study_delete_deck_confirm"
                  : "study_clear_deck_confirm",
            )}
          </Text>
          <Group justify="flex-end">
            <Button onClick={() => setConfirmation(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              color={
                confirmation?.operation === "reschedule" ? undefined : "red"
              }
              variant="filled"
              onClick={() => void manageDeck(confirmation)}
              loading={busy}
            >
              {t(
                confirmation?.operation === "reschedule"
                  ? "study_reschedule_deck"
                  : confirmation?.operation === "delete"
                    ? "study_delete_deck"
                    : "study_clear_deck",
              )}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function StudyRows({
  row,
  busy,
  start,
  manage,
  edit,
}: {
  row: Responses["studyOverview"][number];
  busy: boolean;
  start: (language: string, deckId?: string) => Promise<void>;
  manage: (action: DeckAction) => void;
  edit: (id: string | undefined, parentId: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const visible = row.decks.filter((deck) => {
    let parentId = deck.parentId;
    while (parentId) {
      if (collapsed.has(parentId)) return false;
      parentId =
        row.decks.find((parent) => parent.id === parentId)?.parentId ?? null;
    }
    return true;
  });
  return (
    <>
      {[
        {
          ...row,
          id: undefined,
          name: languageLabel(row.language),
          label: languageLabel(row.language),
          depth: -1,
          parentId: null,
        },
        ...(collapsed.has(row.language)
          ? []
          : [
              {
                ...row.mined,
                id: "mined",
                name: t("study_mined_words"),
                label: t("study_mined_words"),
                depth: 0,
                parentId: null,
              },
              ...visible,
            ]),
      ].map((deck) => {
        const actions = deck.id && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label={t("study_deck_actions_for", {
                  language: languageName(row.language),
                  name: deckPathLabel(deck.name),
                })}
                onClick={(event) => event.stopPropagation()}
                disabled={busy}
              >
                <MoreHorizontal aria-hidden size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
              <Menu.Item
                component="a"
                href={`#words/${row.language}/${encodeURIComponent(deck.id!)}`}
                leftSection={<List size={16} />}
              >
                {t("study_view_words")}
              </Menu.Item>
              {"dictionaryId" in deck && deck.dictionaryId && (
                <Menu.Item
                  leftSection={<RefreshCw size={16} />}
                  onClick={() =>
                    manage({
                      language: row.language,
                      deckId: deck.id!,
                      name: deckPathLabel(deck.name),
                      operation: "refresh",
                    })
                  }
                >
                  {t("study_refresh_deck")}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<CalendarClock size={16} />}
                disabled={!deck.wordCount}
                onClick={() =>
                  manage({
                    language: row.language,
                    deckId: deck.id!,
                    name: deckPathLabel(deck.name),
                    operation: "reschedule",
                  })
                }
              >
                {t("study_reschedule_deck")}
              </Menu.Item>
              {deck.id !== "mined" && (
                <>
                  <Menu.Item
                    leftSection={<Pencil size={16} />}
                    onClick={() => edit(deck.id, deck.parentId)}
                  >
                    {t("study_edit_deck")}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<FolderPlus size={16} />}
                    onClick={() => edit(undefined, deck.id!)}
                  >
                    {t("study_add_subdeck")}
                  </Menu.Item>
                </>
              )}
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<Eraser size={16} />}
                disabled={!deck.wordCount}
                onClick={() =>
                  manage({
                    language: row.language,
                    deckId: deck.id!,
                    name: deckPathLabel(deck.name),
                    operation: "clear",
                  })
                }
              >
                {t("study_clear_deck")}
              </Menu.Item>
              {deck.id !== "mined" && (
                <Menu.Item
                  color="red"
                  leftSection={<Trash2 size={16} />}
                  onClick={() =>
                    manage({
                      language: row.language,
                      deckId: deck.id!,
                      name: deckPathLabel(deck.name),
                      operation: "delete",
                    })
                  }
                >
                  {t("study_delete_deck")}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        );
        const labelButton = (
          <NavLink
            component="button"
            label={deck.label}
            title={deck.label}
            flex={1}
            miw={0}
            noWrap
            p={0}
            fw={deck.id ? undefined : 600}
            disabled={busy || !deck.total}
            onClick={(event) => {
              event.stopPropagation();
              void start(row.language, deck.id);
            }}
          />
        );
        const key = deck.id ?? row.language;
        const hasChildren =
          !deck.id || row.decks.some((child) => child.parentId === deck.id);
        const name = (
          <Group gap={0} wrap="nowrap" miw={0}>
            {hasChildren ? (
              <ActionIcon
                aria-label={t(
                  collapsed.has(key)
                    ? "study_expand_deck"
                    : "study_collapse_deck",
                  { name: deck.label },
                )}
                aria-expanded={!collapsed.has(key)}
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
              >
                {collapsed.has(key) ? (
                  <ChevronRight size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </ActionIcon>
            ) : deck.id ? (
              <Box w="2.75rem" flex="0 0 auto" />
            ) : null}
            {labelButton}
          </Group>
        );
        return (
          <Table.Tr
            key={deck.id || row.language}
            onClick={() => {
              if (!busy && deck.total) void start(row.language, deck.id);
            }}
            style={{ cursor: busy || !deck.total ? "default" : "pointer" }}
          >
            <Table.Td
              pl={
                deck.depth > 0
                  ? `calc(var(--mantine-spacing-md) * ${deck.depth})`
                  : 0
              }
            >
              {name}
            </Table.Td>
            {(
              [
                ["new", deck.fresh, "blue"],
                ["srs_queue_learning", deck.learning, "orange"],
                ["due", deck.due, "green"],
              ] as const
            ).map(([label, count, color]) => (
              <Table.Td key={label} ta="right">
                <Text
                  component="span"
                  c={count ? color : "var(--mantine-color-dimmed)"}
                  title={t(label)}
                  aria-label={`${t(label)}: ${number(count)}`}
                >
                  {number(count)}
                </Text>
              </Table.Td>
            ))}
            <Table.Td ta="right">{actions}</Table.Td>
          </Table.Tr>
        );
      })}
    </>
  );
}
