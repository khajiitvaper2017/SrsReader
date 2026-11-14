import { Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import type { WordWithCards } from "@/vocabulary/model";
import { getCardDocument } from "@/cards/storage";
import { vocabularyClient } from "@/vocabulary/client";
import { fieldText } from "@/cards/template";
import { t } from "@/shared/i18n/i18n";

export function ReadingCardSelect({
  word,
  disabled,
  onChanged,
  onError,
}: {
  word: WordWithCards;
  disabled?: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<{ value: string; label: string }[]>([]);
  const ids = word.linkedCards.map((card) => card.id).join("\n");
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      word.linkedCards.map(async (card, index) => {
        const document = await getCardDocument(card.id);
        const template =
          document?.noteType.templates[
            document.noteType.kind === "cloze" ? 0 : card.templateOrdinal
          ];
        const sentenceIndex = document?.noteType.bindings.sentence;
        const sentence =
          sentenceIndex === undefined
            ? ""
            : fieldText(document!.note.fields[sentenceIndex] || "");
        return {
          value: card.id,
          label: [
            document?.noteType.name,
            template?.name,
            document?.note.encounter?.context.surface,
            document?.note.encounter?.pos,
            document?.note.encounter
              ? Object.entries(document.note.encounter.feats)
                  .map(([name, value]) => `${name}=${value}`)
                  .join(", ")
              : undefined,
            `#${index + 1}`,
            card.suspended ? t("suspended") : undefined,
            sentence.slice(0, 80),
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    )
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch((error: Error) => onError(error.message));
    return () => {
      cancelled = true;
    };
  }, [ids]);
  if (word.linkedCards.length < 2) return null;
  return (
    <Stack gap="xs">
      <Select
        label={t("reading_card")}
        placeholder={t("select_reading_card")}
        data={data}
        value={word.cardId ?? null}
        allowDeselect={false}
        disabled={disabled}
        onChange={(cardId) => {
          if (cardId)
            void vocabularyClient({
              action: "selectReadingCard",
              id: word.id,
              cardId,
            })
              .then(onChanged)
              .catch((error: Error) => onError(error.message));
        }}
      />
      <Text variant="supporting">{t("reading_card_help")}</Text>
    </Stack>
  );
}
