import {
  Alert,
  Button,
  FileButton,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { liveQuery } from "dexie";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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
import { fieldText } from "@/cards/template";

const roles: (keyof FieldBindings)[] = [
  "word",
  "reading",
  "definitions",
  "sentence",
  "sentenceFurigana",
  "translation",
  "wordAudio",
  "sentenceAudio",
  "image",
];

export function AnkiTransfer({
  settings,
  onComplete,
}: {
  settings: Settings;
  onComplete: () => void;
}) {
  const [opened, setOpened] = useState<"import" | "export" | null>(null);
  const [file, setFile] = useState<File>();
  const resetFile = useRef<() => void>(null);
  const [preview, setPreview] = useState<AnkiPreview>();
  const [options, setOptions] = useState<AnkiImportOptions>({
    mode: "preserve",
    language: settings.studyLanguage,
    deckIds: [],
    duplicates: "keep",
    bindings: {},
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
        .then(setDecks)
        .catch((error: Error) => setError(error.message));
  }, [opened, options.language]);

  async function inspect(value: File | null) {
    if (!value) return;
    setFile(value);
    setPreview(undefined);
    setError("");
    setNotice("");
    setBusy(true);
    setOpened("import");
    try {
      const result = await inspectPackage(value);
      setPreview(result);
      setOptions({
        mode: "preserve",
        language: settings.studyLanguage,
        deckIds: result.decks.map((deck) => deck.id),
        duplicates: "keep",
        bindings: Object.fromEntries(
          result.noteTypes.map((type) => [type.id, type.suggestedBindings]),
        ),
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      resetFile.current?.();
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    const subscription = liveQuery(() =>
      db.importTasks.get("current"),
    ).subscribe((task) => setProgress(task?.progress));
    try {
      if (opened === "import" && file) {
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
    } catch (error) {
      setError((error as Error).message);
    } finally {
      subscription.unsubscribe();
      setBusy(false);
      setProgress(undefined);
    }
  }

  const selectedTypes =
    preview?.noteTypes.filter((type) =>
      type.deckIds.some((id) => options.deckIds.includes(id)),
    ) ?? [];
  const incompatibleTypes =
    options.mode === "preserve"
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
      <Group>
        <FileButton
          resetRef={resetFile}
          accept=".apkg"
          onChange={(value) => void inspect(value)}
        >
          {(props) => (
            <Button
              {...props}
              disabled={busy}
              leftSection={<ArrowDownToLine aria-hidden size={16} />}
            >
              {t("anki_import")}
            </Button>
          )}
        </FileButton>
        <Button
          disabled={busy}
          onClick={() => {
            setOpened("export");
            setError("");
            setExportDeck("");
          }}
          leftSection={<ArrowUpFromLine aria-hidden size={16} />}
        >
          {t("anki_export")}
        </Button>
      </Group>
      {notice && (
        <Alert withCloseButton onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      <Modal
        closeButtonProps={{ "aria-label": t("close") }}
        opened={opened !== null}
        onClose={() => {
          if (!busy) setOpened(null);
        }}
        title={t(opened === "export" ? "anki_export" : "anki_import")}
        size="xl"
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <ErrorBox error={error} />
          {progress && (
            <Text role="status" variant="supporting">
              {progress.phase}{" "}
              {progress.total
                ? `${number(progress.done)} / ${number(progress.total)}`
                : ""}
            </Text>
          )}
          {busy && !progress && (
            <Text role="status" variant="supporting">
              {t("loading")}
            </Text>
          )}
          <LanguageSelect
            label={t("language")}
            value={options.language}
            onChange={(language) => {
              setOptions({ ...options, language });
              setExportDeck("");
            }}
            disabled={busy}
          />
          {opened === "export" ? (
            <Select
              label={t("anki_decks")}
              value={exportDeck}
              disabled={busy}
              data={[
                { value: "", label: t("anki_all_decks") },
                ...decks.map((deck) => ({ value: deck.id, label: deck.name })),
              ]}
              onChange={(value) => setExportDeck(value ?? "")}
            />
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
                <MultiSelect
                  label={t("anki_decks")}
                  data={preview.decks.map((deck) => ({
                    value: deck.id,
                    label: `${deck.name} (${number(deck.cards)})`,
                  }))}
                  value={options.deckIds}
                  onChange={(deckIds) => setOptions({ ...options, deckIds })}
                  searchable
                  disabled={busy}
                />
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
                <Text variant="supporting">{t("anki_history_help")}</Text>
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
                {selectedTypes.map((type) => (
                  <Stack gap="xs" key={type.id}>
                    <Title order={3}>{type.name}</Title>
                    <Text variant="supporting">
                      {t("anki_note_type_summary", {
                        fields: number(type.fields.length),
                        templates: number(type.templates),
                        notes: number(type.notes),
                      })}
                    </Text>
                    {roles.map((role) => (
                      <Select
                        key={role}
                        label={t(`card_field_${role}`)}
                        value={
                          options.bindings[type.id]?.[role]?.toString() ?? ""
                        }
                        data={[
                          { value: "", label: t("anki_not_mapped") },
                          ...type.fields.map((name, index) => ({
                            value: String(index),
                            label: name,
                          })),
                        ]}
                        disabled={busy}
                        required={options.mode === "convert" && role === "word"}
                        onChange={(value) => {
                          const bindings = { ...options.bindings[type.id] };
                          if (!value) delete bindings[role];
                          else bindings[role] = Number(value);
                          setOptions({
                            ...options,
                            bindings: {
                              ...options.bindings,
                              [type.id]: bindings,
                            },
                          });
                        }}
                      />
                    ))}
                    <Table.ScrollContainer minWidth={300}>
                      <Table>
                        <Table.Tbody>
                          {type.fields.map((name, index) => (
                            <Table.Tr key={index}>
                              <Table.Th>{name}</Table.Th>
                              <Table.Td>
                                <Text lineClamp={3}>
                                  {fieldText(type.sampleFields?.[index] ?? "")}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  </Stack>
                ))}
              </>
            )
          )}
          <Group justify="flex-end">
            <Button
              disabled={busy || invalid}
              loading={busy}
              onClick={() => void submit()}
              variant="filled"
            >
              {t(opened === "export" ? "anki_export" : "anki_import")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
