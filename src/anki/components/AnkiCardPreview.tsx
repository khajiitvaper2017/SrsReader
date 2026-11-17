import {
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";
import { ankiWord, convertedAnkiNote } from "@/anki/conversion";
import type { AnkiPreview } from "@/anki/model";
import { CardViewer } from "@/cards/components/CardViewer";
import type { CardAsset, CardDocument, FieldBindings } from "@/cards/model";
import { prepareStudyDocument } from "@/cards/study";
import type { Settings } from "@/settings/model";
import { number, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";

export function AnkiCardPreview({
  type,
  preview,
  language,
  deckIds,
  bindings,
  convert,
  settings,
}: {
  type: AnkiPreview["noteTypes"][number];
  preview: AnkiPreview;
  language: string;
  deckIds: string[];
  bindings: FieldBindings;
  convert: boolean;
  settings: Settings;
}) {
  const theme = useMantineTheme();
  const narrow = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [cardId, setCardId] = useState<string | null>(null);
  const [side, setSide] = useState("front");
  const samples = [
    ...new Map(
      type.samples
        .filter((sample) => deckIds.includes(sample.deckId))
        .map((sample) => [sample.document.card.templateOrdinal, sample]),
    ).values(),
  ];
  const sample =
    samples.find((sample) => sample.document.card.id === cardId) ?? samples[0]!;
  const original = sample.document;
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
      const { note, noteType, assets } = await convertedAnkiNote(
        imported.word,
        original.noteType.fields,
        original.note.fields,
        bindings,
        original.note.mediaNamespace,
      );
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
        note: { ...original.note, language },
      };
  const title = t(
    convert ? "anki_dictionary_preview" : "anki_original_preview",
  );
  const assets = convert ? converted?.assets : undefined;
  const loadAssets = useCallback<AnkiPreview["loadAssets"]>(
    async (namespace, html, css) => [
      ...(await preview.loadAssets(namespace, html, css)),
      ...(assets ?? []),
    ],
    [preview, assets],
  );
  const requestAsset: AnkiPreview["requestAsset"] = async (namespace, name) =>
    assets?.find((asset) => asset.name === name)?.blob ??
    preview.requestAsset(namespace, name);
  return (
    <Stack gap="xs" miw={0}>
      <Title order={4}>{title}</Title>
      {samples.length > 1 && (
        <Select
          label={t("anki_preview_card")}
          value={sample.document.card.id}
          onChange={setCardId}
          data={samples.map(({ document }) => ({
            value: document.card.id,
            label:
              type.kind === "cloze"
                ? t("anki_cloze_preview", {
                    number: number(document.card.templateOrdinal + 1),
                  })
                : document.noteType.templates[document.card.templateOrdinal]!
                    .name,
          }))}
        />
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
                      settings={{ ...settings, autoplay: false }}
                      deckName={sample.deckName}
                      loadAssets={loadAssets}
                      requestAsset={requestAsset}
                    />
                  </ScrollArea.Autosize>
                </Paper>
              </Stack>
            ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
