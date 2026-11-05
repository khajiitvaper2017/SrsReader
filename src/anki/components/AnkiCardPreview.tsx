import {
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
import { useState } from "react";
import type { AnkiPreview } from "@/anki/model";
import { CardViewer } from "@/cards/components/CardViewer";
import type { Settings } from "@/settings/model";
import { number, t } from "@/shared/i18n/i18n";

export function AnkiCardPreview({
  type,
  preview,
  language,
  settings,
}: {
  type: AnkiPreview["noteTypes"][number];
  preview: AnkiPreview;
  language: string;
  settings: Settings;
}) {
  const theme = useMantineTheme();
  const narrow = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [cardId, setCardId] = useState<string | null>(null);
  const [side, setSide] = useState("front");
  const sample =
    type.samples.find((sample) => sample.document.card.id === cardId) ??
    type.samples[0]!;
  const document = {
    ...sample.document,
    card: { ...sample.document.card, language },
    note: { ...sample.document.note, language },
  };
  return (
    <Stack gap="xs" miw={0}>
      <Title order={4}>{t("anki_original_preview")}</Title>
      {type.samples.length > 1 && (
        <Select
          label={t("anki_preview_card")}
          value={sample.document.card.id}
          onChange={setCardId}
          data={type.samples.map(({ document }) => ({
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
          aria-label={t("anki_original_preview")}
          fullWidth
          value={side}
          onChange={setSide}
          data={[
            { value: "front", label: t("card_front") },
            { value: "back", label: t("card_back") },
          ]}
        />
      )}
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
                    loadAssets={preview.loadAssets}
                    requestAsset={preview.requestAsset}
                  />
                </ScrollArea.Autosize>
              </Paper>
            </Stack>
          ))}
      </SimpleGrid>
    </Stack>
  );
}
