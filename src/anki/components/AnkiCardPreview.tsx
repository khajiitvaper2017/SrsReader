import {
  ActionIcon,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Title,
  type ComboboxItem,
  type OptionsFilter,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import {
  ankiDictionarySnapshot,
  ankiWord,
  convertedAnkiNote,
} from "@/anki/conversion";
import type { AnkiPreview } from "@/anki/model";
import { CardViewer } from "@/cards/components/CardViewer";
import type { CardAsset, CardDocument, FieldBindings } from "@/cards/model";
import { prepareStudyDocument } from "@/cards/study";
import { fieldHasContent } from "@/cards/template";
import type { Settings } from "@/settings/model";
import { number, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";

const filterCards: OptionsFilter = ({ options, search, limit }) => {
  const query = search.trim().toLowerCase();
  const exact: ComboboxItem[] = [];
  const starts: ComboboxItem[] = [];
  const contains: ComboboxItem[] = [];
  for (const option of options as ComboboxItem[]) {
    const label = option.label.toLowerCase();
    if (label === query || label.startsWith(`${query} · `)) exact.push(option);
    else if (label.startsWith(query)) starts.push(option);
    else if (label.includes(query)) contains.push(option);
  }
  return [...exact, ...starts, ...contains].slice(0, limit);
};

export function AnkiCardPreview({
  type,
  preview,
  language,
  deckIds,
  bindings,
  omittedFields,
  onOmitField,
  convert,
  settings,
}: {
  type: AnkiPreview["noteTypes"][number];
  preview: AnkiPreview;
  language: string;
  deckIds: string[];
  bindings: FieldBindings;
  omittedFields: number[];
  onOmitField: (index: number) => void;
  convert: boolean;
  settings: Settings;
}) {
  const theme = useMantineTheme();
  const narrow = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [cardId, setCardId] = useState<string | null>(null);
  const [side, setSide] = useState("front");
  const samples = useMemo(
    () => type.samples.filter((sample) => deckIds.includes(sample.deckId)),
    [type.samples, deckIds],
  );
  const sample =
    samples.find((sample) => sample.cardId === cardId) ?? samples[0]!;
  const selectedCard = sample.cardId;
  const omitted = useMemo(() => new Set(omittedFields), [omittedFields]);
  const original = useMemo(
    () => type.sampleDocument(selectedCard),
    [type, selectedCard],
  );
  const choices = useMemo(
    () =>
      samples.map((sample) => {
        const template =
          type.kind === "cloze"
            ? t("anki_cloze_preview", { number: number(sample.ordinal + 1) })
            : original.noteType.templates[sample.ordinal]?.name;
        return {
          value: sample.cardId,
          label: [
            sample.label ||
              t("anki_preview_card_number", { number: sample.cardId }),
            type.templates > 1 || type.kind === "cloze" ? template : "",
            deckIds.length > 1 ? sample.deckName : "",
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    [
      samples,
      type.kind,
      type.templates,
      original.noteType.templates,
      deckIds.length,
      settings.interfaceLanguage,
    ],
  );
  const [converted, setConverted] = useState<{
    document: CardDocument;
    assets: CardAsset[];
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    setConverted(undefined);
    setError("");
    if (!convert) return;
    let active = true;
    void (async () => {
      const imported = await ankiWord(
        original.note.fields,
        bindings,
        {
          ...settings,
          studyLanguage: language,
        },
        true,
      );
      if (!imported)
        throw new Error(t("anki_word_field_empty", { name: type.name }));
      const { note, noteType } = convertedAnkiNote(
        imported.word,
        original.noteType.fields,
        original.note.fields,
        bindings,
        original.note.mediaNamespace,
        // Extra fields render separately so their buttons stay outside the card sandbox.
        new Set(original.note.fields.keys()),
      );
      const { html, assets } = await ankiDictionarySnapshot(
        imported.word,
        note.mediaNamespace,
        note.importedPartsOfSpeech,
        imported.gender ? [imported.gender] : undefined,
      );
      note.fields[noteType.bindings.definitions!] = html;
      note.importedGenders = imported.gender ? [imported.gender] : undefined;
      const document = await prepareStudyDocument(
        {
          card: {
            ...original.card,
            noteId: note.id,
            templateOrdinal: 0,
            language,
          },
          note,
          noteType,
        },
        imported.word,
      );
      if (active) setConverted({ document, assets });
    })().catch((failure: Error) => {
      if (active) setError(failure.message);
    });
    return () => {
      active = false;
    };
  }, [convert, original, bindings, language, settings, type.name]);
  const document = convert
    ? converted?.document
    : {
        ...original,
        noteType: { ...original.noteType, bindings },
        card: { ...original.card, language },
        note: {
          ...original.note,
          language,
          fields: original.note.fields.map((value, index) =>
            omitted.has(index) ? "" : value,
          ),
        },
      };
  const title = t(
    convert ? "anki_dictionary_preview" : "anki_original_preview",
  );
  const assets = convert ? converted?.assets : undefined;
  const loadAssets = useCallback<AnkiPreview["loadAssets"]>(
    async (namespace, html, css, source, dictionaryAssets) => [
      ...(await preview.loadAssets(
        namespace,
        html,
        css,
        source,
        dictionaryAssets,
      )),
      ...(assets ?? []),
    ],
    [preview, assets],
  );
  const requestAsset: AnkiPreview["requestAsset"] = async (namespace, name) =>
    assets?.find((asset) => asset.name === name)?.blob ??
    preview.requestAsset(namespace, name);
  const mapped = new Set(Object.values(bindings));
  const extraFields = convert
    ? type.fields.flatMap((name, index) => {
        const value = original.note.fields[index] ?? "";
        return !mapped.has(index) &&
          !omitted.has(index) &&
          fieldHasContent(value)
          ? [{ name, index, value }]
          : [];
      })
    : [];
  return (
    <Stack gap="xs" miw={0}>
      <Title order={4}>{title}</Title>
      {samples.length > 1 && (
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Select
            label={t("anki_preview_card")}
            searchable
            allowDeselect={false}
            limit={12}
            filter={filterCards}
            nothingFoundMessage={t("anki_preview_no_matches")}
            flex={1}
            miw={0}
            value={selectedCard}
            onChange={setCardId}
            data={choices}
          />
          <ActionIcon
            size="input-sm"
            title={t("another_example")}
            aria-label={t("another_example")}
            onClick={() =>
              setCardId(
                samples[(samples.indexOf(sample) + 1) % samples.length]!.cardId,
              )
            }
          >
            <ChevronRight size={16} aria-hidden />
          </ActionIcon>
        </Group>
      )}
      {narrow && (
        <SegmentedControl
          aria-label={title}
          fullWidth
          value={side}
          onChange={setSide}
          data={[
            { value: "front", label: t("card_front") },
            { value: "back", label: t("card_back") },
          ]}
        />
      )}
      <ErrorBox error={error} />
      {!document && !error && <Loader size="sm" aria-label={title} />}
      {document && (
        <SimpleGrid cols={narrow ? 1 : 2}>
          {(["front", "back"] as const)
            .filter((value) => !narrow || value === side)
            .map((value) => (
              <Stack gap="xs" miw={0} key={value}>
                {!narrow && <Title order={5}>{t(`card_${value}`)}</Title>}
                <Paper withBorder p="sm" miw={0}>
                  <ScrollArea.Autosize mah={420} type="auto">
                    <CardViewer
                      document={document}
                      revealed={value === "back"}
                      settings={settings}
                      wordAudio="preview"
                      deckName={sample.deckName}
                      loadAssets={loadAssets}
                      requestAsset={requestAsset}
                    />
                    {value === "back" &&
                      extraFields.map((field) => {
                        const label = t("anki_omit_field", {
                          field: field.name,
                        });
                        return (
                          <Stack component="section" gap={0} key={field.index}>
                            <Group
                              justify="space-between"
                              wrap="nowrap"
                              px="sm"
                            >
                              <Title
                                order={5}
                                style={{ overflowWrap: "anywhere" }}
                              >
                                {field.name}
                              </Title>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                title={label}
                                aria-label={label}
                                onClick={() => onOmitField(field.index)}
                              >
                                <X size={16} aria-hidden />
                              </ActionIcon>
                            </Group>
                            <CardViewer
                              document={{
                                card: document.card,
                                note: {
                                  ...document.note,
                                  fields: [field.value],
                                },
                                noteType: {
                                  ...document.noteType,
                                  fields: [{ name: "Preview" }],
                                  bindings: {},
                                  templates: [
                                    {
                                      name: field.name,
                                      front: "{{Preview}}",
                                      back: "",
                                    },
                                  ],
                                  css:
                                    document.noteType.css +
                                    ".card{min-height:0}",
                                },
                              }}
                              revealed={false}
                              settings={settings}
                              title={field.name}
                              deckName={sample.deckName}
                              loadAssets={loadAssets}
                              requestAsset={requestAsset}
                            />
                          </Stack>
                        );
                      })}
                  </ScrollArea.Autosize>
                </Paper>
              </Stack>
            ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
