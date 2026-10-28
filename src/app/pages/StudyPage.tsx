import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
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
import { ReviewStatistics } from "@/srs/components/ReviewStatistics";
import type { Responses } from "@/srs/contracts";
import {
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
  operation: "refresh" | "clear" | "delete";
};

export function StudyPage({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}) {
  const theme = useMantineTheme();
  const narrow = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [languages, setLanguages] = useState<Responses["studyOverview"]>();
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"language" | "deck" | null>(null);
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
    "frequency",
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
      await srsClient({
        action: "manageDeck",
        language: action.language,
        deckId: action.deckId,
        operation: action.operation,
      });
      setConfirmation(null);
      setNotice(
        action.operation === "refresh"
          ? t("study_deck_refreshed", { name: action.name })
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
      narrow={narrow}
      busy={busy}
      start={start}
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
        <Menu>
          <Menu.Target>
            <Button leftSection={<Plus size={16} />} disabled={busy}>
              {t("add")}
            </Button>
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
      </Group>
      <TaskAlerts
        busy={busy}
        error={modal || confirmation ? "" : error}
        notice={notice}
        onDismissError={() => setError("")}
        onDismissNotice={() => setNotice("")}
      />
      <Paper>
        {!languages && !error && <Loader />}
        {narrow ? (
          <Stack>{rows}</Stack>
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("study_language_deck")}</Table.Th>
                  <Table.Th ta="right">{t("new")}</Table.Th>
                  <Table.Th ta="right">{t("srs_queue_learning")}</Table.Th>
                  <Table.Th ta="right">{t("due")}</Table.Th>
                  <Table.Th aria-label={t("study_deck_actions")} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <Text variant="supporting" mt="md">
          {t("study_overview_help")}
        </Text>
      </Paper>
      <ReviewStatistics />
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
          confirmation?.operation === "delete"
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
              confirmation?.operation === "delete"
                ? "study_delete_deck_confirm"
                : "study_clear_deck_confirm",
            )}
          </Text>
          <Group justify="flex-end">
            <Button onClick={() => setConfirmation(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              color="red"
              variant="filled"
              onClick={() => void manageDeck(confirmation)}
              loading={busy}
            >
              {t(
                confirmation?.operation === "delete"
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
  narrow,
  busy,
  start,
  manage,
}: {
  row: Responses["studyOverview"][number];
  narrow: boolean | undefined;
  busy: boolean;
  start: (language: string, deckId?: string) => Promise<void>;
  manage: (action: DeckAction) => void;
}) {
  return (
    <>
      {[
        { ...row, id: undefined, name: languageLabel(row.language) },
        { ...row.mined, id: "mined", name: t("study_mined_words") },
        ...row.decks,
      ].map((deck) => {
        const actions = deck.id && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label={t("study_deck_actions_for", {
                  language: languageName(row.language),
                  name: deck.name,
                })}
                onClick={(event) => event.stopPropagation()}
                disabled={busy}
              >
                <MoreHorizontal size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
              <Menu.Item
                component="a"
                href={`#words/${row.language}/${deck.id}`}
                leftSection={<List size={16} />}
              >
                {t("study_view_words")}
              </Menu.Item>
              {deck.id !== "mined" && (
                <Menu.Item
                  leftSection={<RefreshCw size={16} />}
                  onClick={() =>
                    manage({
                      language: row.language,
                      deckId: deck.id!,
                      name: deck.name,
                      operation: "refresh",
                    })
                  }
                >
                  {t("study_refresh_deck")}
                </Menu.Item>
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
                    name: deck.name,
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
                      name: deck.name,
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
        const name = (
          <Button
            variant="transparent"
            disabled={busy || !deck.total}
            miw={0}
            onClick={(event) => {
              event.stopPropagation();
              void start(row.language, deck.id);
            }}
          >
            {deck.name}
          </Button>
        );
        if (narrow)
          return (
            <Paper key={deck.id || row.language} p="sm">
              <Stack gap="xs">
                <Group wrap="nowrap" justify="space-between">
                  {name}
                  {actions}
                </Group>
                <SimpleGrid cols={3} spacing="xs">
                  {(
                    [
                      ["new", deck.fresh],
                      ["srs_queue_learning", deck.learning],
                      ["due", deck.due],
                    ] as const
                  ).map(([label, count]) => (
                    <Stack key={label} gap={0} align="center">
                      <Text variant="supporting">{t(label)}</Text>
                      <Text>{number(count)}</Text>
                    </Stack>
                  ))}
                </SimpleGrid>
              </Stack>
            </Paper>
          );
        return (
          <Table.Tr
            key={deck.id || row.language}
            onClick={() => {
              if (!busy && deck.total) void start(row.language, deck.id);
            }}
            style={{ cursor: busy || !deck.total ? "default" : "pointer" }}
          >
            <Table.Td pl={deck.id ? "xl" : undefined}>{name}</Table.Td>
            <Table.Td ta="right">{number(deck.fresh)}</Table.Td>
            <Table.Td ta="right">{number(deck.learning)}</Table.Td>
            <Table.Td ta="right">{number(deck.due)}</Table.Td>
            <Table.Td ta="right">{actions}</Table.Td>
          </Table.Tr>
        );
      })}
    </>
  );
}
