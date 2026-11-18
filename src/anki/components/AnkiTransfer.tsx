import {
  Accordion,
  ActionIcon,
  Alert,
  Button,
  FileButton,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, MoreHorizontal } from "lucide-react";
import type { Settings } from "@/settings/model";
import type { FieldBindings } from "@/cards/model";
import type { AnkiImportOptions, AnkiPreview } from "@/anki/model";
import { LanguageSelect } from "@/languages/components/LanguageSelect";
import { inspectPackage } from "@/anki/read";
import { startImport } from "@/imports/client";
import { db } from "@/platform/database/db";
import { rpc } from "@/platform/messaging/send";
import { saveBlob, type ImportProgress } from "@/shared/download";
import { i18n, number, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { TaskProgress } from "@/shared/ui/TaskProgress";
import { AnkiCardPreview } from "@/anki/components/AnkiCardPreview";
import { deckPathLabel, deckTree } from "@/srs/deck-tree";

const roles: (keyof FieldBindings)[] = [
  "word",
  "reading",
  "definitions",
  "pos",
  "sentence",
  "sentenceFurigana",
  "translation",
  "wordAudio",
  "sentenceAudio",
  "image",
];
const noOmittedFields: number[] = [];

export function AnkiTransfer({
  settings,
  onComplete,
}: {
  settings: Settings;
  onComplete: () => void;
}) {
  const theme = useMantineTheme();
  const narrow = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [opened, setOpened] = useState<"import" | "export" | null>(null);
  const [file, setFile] = useState<File>();
  const resetFile = useRef<() => void>(null);
  const [preview, setPreview] = useState<AnkiPreview>();
  const [options, setOptions] = useState<AnkiImportOptions>({
    mode: "preserve",
    language: settings.studyLanguage,
    deckIds: [],
    duplicates: "keep",
    mergeNoteTypes: false,
    bindings: {},
    omitFields: {},
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<ImportProgress>();
  const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
  const [exportDeck, setExportDeck] = useState("");
  useEffect(() => {
    if (opened === "export")
      void db.decks
        .where("language")
        .equals(options.language)
        .toArray()
        .then((decks) => setDecks(deckTree(decks)))
        .catch((error: Error) => setError(error.message));
  }, [opened, options.language]);

  useEffect(
    () => () => {
      void preview?.close();
    },
    [preview],
  );

  async function inspect(value: File | null) {
    if (!value) return;
    setFile(value);
    setPreview(undefined);
    setError("");
    setNotice("");
    setBusy(true);
    setOpened("import");
    setProgress({ phase: t("anki_reading"), done: 0, total: 0 });
    try {
      const result = await inspectPackage(value);
      setPreview(result);
      setOptions({
        mode: "preserve",
        language: settings.studyLanguage,
        deckIds: result.decks.map((deck) => deck.id),
        duplicates: "keep",
        mergeNoteTypes: false,
        bindings: Object.fromEntries(
          result.noteTypes.map((type) => [type.id, type.suggestedBindings]),
        ),
        omitFields: {},
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setProgress(undefined);
      resetFile.current?.();
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (opened === "import" && file) {
        setOpened(null);
        await startImport({
          type: "anki",
          language: options.language,
          locale: i18n.language,
          blob: file,
          title: file.name,
          options,
        });
        setNotice(t("anki_imported"));
      } else {
        const { exportPackage } = await import("@/anki/export");
        const blob = await exportPackage(
          options.language,
          exportDeck || undefined,
          setProgress,
        );
        saveBlob(blob, `srs-reader-${options.language}.apkg`);
      }
      await rpc({ action: "invalidate" });
      onComplete();
      setOpened(null);
      setPreview(undefined);
      setFile(undefined);
    } catch (error) {
      setError((error as Error).message);
      if (opened === "import") setOpened("import");
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }

  const selectedTypes =
    preview?.noteTypes.filter((type) =>
      type.deckIds.some((id) => options.deckIds.includes(id)),
    ) ?? [];
  const incompatibleTypes =
    options.mode === "preserve" && !options.mergeNoteTypes
      ? selectedTypes.filter((type) =>
          preview?.incompatibleNoteTypes.includes(type.id),
        )
      : [];
  const invalid =
    incompatibleTypes.length > 0 ||
    !options.language ||
    (opened === "import" &&
      (!preview ||
        !options.deckIds.length ||
        (options.mode === "convert" &&
          selectedTypes.some(
            (type) => options.bindings[type.id]?.word === undefined,
          ))));
  return (
    <>
      <FileButton
        resetRef={resetFile}
        accept=".apkg"
        onChange={(value) => void inspect(value)}
      >
        {(props) => (
          <Menu>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label={t("actions")}
                disabled={busy}
              >
                <MoreHorizontal aria-hidden size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                {...props}
                disabled={busy}
                leftSection={<ArrowDownToLine aria-hidden size={16} />}
              >
                {t("anki_import")}
              </Menu.Item>
              <Menu.Item
                disabled={busy}
                onClick={() => {
                  setOpened("export");
                  setError("");
                  setExportDeck("");
                }}
                leftSection={<ArrowUpFromLine aria-hidden size={16} />}
              >
                {t("anki_export")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </FileButton>
      {notice && (
        <Alert withCloseButton onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      <Modal
        closeButtonProps={{ "aria-label": t("close"), size: "xl" }}
        opened={opened !== null}
        onClose={() => {
          if (!busy) {
            setOpened(null);
            setPreview(undefined);
            setFile(undefined);
          }
        }}
        title={t(opened === "export" ? "anki_export" : "anki_import")}
        size={opened === "import" && preview ? "80rem" : "md"}
        fullScreen={narrow && !!preview}
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <ErrorBox error={error} />
          {busy && file && (
            <Text variant="supporting" style={{ overflowWrap: "anywhere" }}>
              {file.name}
            </Text>
          )}
          {progress && <TaskProgress progress={progress} />}
          {opened === "export" ? (
            <Stack>
              <LanguageSelect
                label={t("language")}
                value={options.language}
                onChange={(language) => {
                  setOptions({ ...options, language });
                  setExportDeck("");
                }}
                disabled={busy}
              />
              <Select
                label={t("anki_decks")}
                value={exportDeck}
                disabled={busy}
                data={[
                  { value: "", label: t("anki_all_decks") },
                  ...decks.map((deck) => ({
                    value: deck.id,
                    label: deckPathLabel(deck.name),
                  })),
                ]}
                onChange={(value) => setExportDeck(value ?? "")}
              />
            </Stack>
          ) : (
            preview &&
            !busy && (
              <>
                <Text variant="supporting">
                  {t("anki_summary", {
                    notes: number(preview.notes),
                    cards: number(preview.cards),
                    media: number(preview.media),
                    reviews: number(preview.reviews),
                  })}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <LanguageSelect
                    label={t("language")}
                    value={options.language}
                    onChange={(language) => {
                      setOptions({ ...options, language });
                      setExportDeck("");
                    }}
                    disabled={busy}
                  />
                  <MultiSelect
                    label={t("anki_decks")}
                    data={preview.decks.map((deck) => ({
                      value: deck.id,
                      label: `${deckPathLabel(deck.name)} (${number(deck.cards)})`,
                    }))}
                    value={options.deckIds}
                    onChange={(deckIds) => setOptions({ ...options, deckIds })}
                    searchable
                    description={t("anki_decks_help")}
                    disabled={busy}
                  />
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Stack gap="xs">
                    <Select
                      label={t("anki_import_mode")}
                      value={options.mode}
                      onChange={(value) =>
                        setOptions({
                          ...options,
                          mode: value as AnkiImportOptions["mode"],
                        })
                      }
                      disabled={busy}
                      data={[
                        { value: "preserve", label: t("anki_preserve") },
                        { value: "convert", label: t("anki_convert") },
                      ]}
                    />
                    <Text variant="supporting">
                      {t(
                        options.mode === "preserve"
                          ? "anki_preserve_help"
                          : "anki_convert_help",
                      )}
                    </Text>
                  </Stack>
                  <Select
                    label={t("anki_duplicates")}
                    value={options.duplicates}
                    onChange={(value) =>
                      setOptions({
                        ...options,
                        duplicates: value as AnkiImportOptions["duplicates"],
                      })
                    }
                    disabled={busy}
                    data={[
                      { value: "keep", label: t("anki_duplicates_keep") },
                      { value: "update", label: t("anki_duplicates_update") },
                    ]}
                  />
                </SimpleGrid>
                <Text variant="supporting">{t("anki_history_help")}</Text>
                {options.mode === "preserve" && (
                  <Stack gap="xs">
                    <Switch
                      label={t("anki_merge_note_types")}
                      checked={options.mergeNoteTypes}
                      disabled={busy}
                      onChange={(event) =>
                        setOptions({
                          ...options,
                          mergeNoteTypes: event.currentTarget.checked,
                        })
                      }
                    />
                    <Text variant="supporting">
                      {t("anki_merge_note_types_help")}
                    </Text>
                  </Stack>
                )}
                <Text variant="supporting">
                  {t(
                    options.duplicates === "update"
                      ? "anki_update_help"
                      : "anki_keep_help",
                  )}
                </Text>
                {incompatibleTypes.length > 0 && (
                  <Alert color="red">
                    {t("anki_incompatible_note_types", {
                      names: incompatibleTypes
                        .map((type) => type.name)
                        .join(", "),
                    })}
                  </Alert>
                )}
                {preview.warnings.map((warning, index) => (
                  <Alert key={index} color="yellow">
                    {warning}
                  </Alert>
                ))}
                {selectedTypes.map((type) => {
                  const bindings = options.bindings[type.id] ?? {};
                  const mapped = new Set(Object.values(bindings));
                  const omitted =
                    options.omitFields[type.id] ?? noOmittedFields;
                  const setOmitted = (fields: number[]) =>
                    setOptions((current) => ({
                      ...current,
                      omitFields: { ...current.omitFields, [type.id]: fields },
                    }));
                  const excluded = new Set(omitted);
                  const unmapped = type.fields.filter(
                    (_, index) => !mapped.has(index) && !excluded.has(index),
                  );
                  const missingWord =
                    options.mode === "convert" && bindings.word === undefined;
                  return (
                    <Stack key={type.id} miw={0}>
                      <Stack gap="xs">
                        <Title order={3}>{type.name}</Title>
                        <Text variant="supporting">
                          {t("anki_note_type_summary", {
                            fields: number(type.fields.length),
                            templates: number(type.templates),
                            notes: number(type.notes),
                          })}
                        </Text>
                      </Stack>
                      {options.language && !missingWord && (
                        <AnkiCardPreview
                          type={type}
                          preview={preview}
                          language={options.language}
                          deckIds={options.deckIds}
                          bindings={bindings}
                          omittedFields={omitted}
                          onOmitField={(index) =>
                            setOmitted([...omitted, index])
                          }
                          convert={options.mode === "convert"}
                          settings={settings}
                        />
                      )}
                      {type.fields.some((_, index) => !mapped.has(index)) && (
                        <MultiSelect
                          label={t("anki_omit_fields")}
                          description={t("anki_omit_fields_help")}
                          data={type.fields.flatMap((label, index) =>
                            mapped.has(index)
                              ? []
                              : [{ label, value: String(index) }],
                          )}
                          searchable
                          clearable
                          value={omitted.map(String)}
                          onChange={(values) => setOmitted(values.map(Number))}
                        />
                      )}
                      {missingWord && (
                        <Alert color="yellow">
                          {t("anki_word_field_required", { name: type.name })}
                        </Alert>
                      )}
                      {unmapped.length > 0 &&
                        (options.mode === "convert" ? (
                          <Alert color="yellow">
                            {t("anki_unmapped_convert", {
                              fields: unmapped.join(", "),
                            })}
                          </Alert>
                        ) : (
                          <Text variant="supporting">
                            {t("anki_unmapped_preserve", {
                              fields: unmapped.join(", "),
                            })}
                          </Text>
                        ))}
                      <Accordion
                        key={options.mode}
                        defaultValue={
                          options.mode === "convert" ? "mapping" : null
                        }
                      >
                        <Accordion.Item value="mapping">
                          <Accordion.Control>
                            {t(
                              options.mode === "preserve"
                                ? "anki_optional_mapping"
                                : "anki_field_mapping",
                            )}
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="xs">
                              <Text variant="supporting">
                                {t(
                                  options.mode === "preserve"
                                    ? "anki_optional_mapping_help"
                                    : "anki_mapping_help",
                                )}
                              </Text>
                              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                                {roles.map((role) => (
                                  <Select
                                    key={role}
                                    label={t(`card_field_${role}`)}
                                    value={bindings[role]?.toString() ?? ""}
                                    data={[
                                      {
                                        value: "",
                                        label: t("anki_not_mapped"),
                                      },
                                      ...type.fields.flatMap((name, index) =>
                                        excluded.has(index)
                                          ? []
                                          : [
                                              {
                                                value: String(index),
                                                label: name,
                                              },
                                            ],
                                      ),
                                    ]}
                                    required={
                                      options.mode === "convert" &&
                                      role === "word"
                                    }
                                    error={
                                      missingWord && role === "word"
                                        ? t("anki_select_word_field")
                                        : undefined
                                    }
                                    onChange={(value) => {
                                      const next = { ...bindings };
                                      if (!value) delete next[role];
                                      else next[role] = Number(value);
                                      setOptions({
                                        ...options,
                                        bindings: {
                                          ...options.bindings,
                                          [type.id]: next,
                                        },
                                      });
                                    }}
                                  />
                                ))}
                              </SimpleGrid>
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      </Accordion>
                    </Stack>
                  );
                })}
              </>
            )
          )}
          {!busy && (
            <Group justify="flex-end">
              <Button
                disabled={invalid}
                onClick={() => void submit()}
                variant="filled"
              >
                {t(opened === "export" ? "anki_export" : "anki_import")}
              </Button>
            </Group>
          )}
        </Stack>
      </Modal>
    </>
  );
}
