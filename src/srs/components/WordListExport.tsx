import {
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
} from "@mantine/core";
import { languageLabel } from "@/languages/codes";
import { saveBlob } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import type { Responses } from "@/srs/contracts";
import { deckPathLabel } from "@/srs/deck-tree";
import type { WordListFilter } from "@/srs/export-word-list";
import { useState } from "react";

export function WordListExport({
  language: initialLanguage,
  languages,
  onClose,
}: {
  language: string;
  languages: Responses["studyOverview"];
  onClose: () => void;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [deckId, setDeckId] = useState("");
  const [filters, setFilters] = useState<WordListFilter[]>([]);
  const [difficulty, setDifficulty] = useState<string | number>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const decks = languages.find((row) => row.language === language)?.decks ?? [];
  const withDifficulty = filters.includes("difficult");
  const validDifficulty =
    typeof difficulty === "number" && difficulty >= 1 && difficulty <= 10;
  async function download() {
    setBusy(true);
    setError("");
    try {
      const { exportWordList } = await import("@/srs/export-word-list");
      const words = await exportWordList(
        language,
        deckId,
        filters,
        Number(difficulty),
      );
      if (!words.length) {
        setError(t("word_list_no_matches"));
        return;
      }
      saveBlob(
        new Blob([words.join("\n") + "\n"], {
          type: "text/plain;charset=utf-8",
        }),
        `srs-reader-${language}-words.txt`,
      );
    } catch (failure) {
      setError((failure as Error).message);
      return;
    } finally {
      setBusy(false);
    }
    onClose();
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={t("word_list_export")}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      withCloseButton={!busy}
    >
      <Stack>
        <ErrorBox error={error} />
        <Select
          label={t("language")}
          data={languages.map(({ language }) => ({
            value: language,
            label: languageLabel(language),
          }))}
          value={language}
          onChange={(value) => {
            if (value) {
              setLanguage(value);
              setDeckId("");
            }
          }}
          disabled={busy}
        />
        <Select
          label={t("anki_decks")}
          data={[
            { value: "", label: t("anki_all_decks") },
            { value: "mined", label: t("study_mined_words") },
            ...decks.map((deck) => ({
              value: deck.id,
              label: deckPathLabel(deck.name),
            })),
          ]}
          value={deckId}
          onChange={(value) => setDeckId(value ?? "")}
          disabled={busy}
        />
        <MultiSelect
          label={t("word_list_filters")}
          description={t("word_list_filters_help")}
          data={[
            { value: "difficult", label: t("word_list_difficult") },
            { value: "failed", label: t("word_list_failed_today") },
            { value: "autoBuried", label: t("word_list_auto_buried") },
          ]}
          value={filters}
          onChange={(values) => setFilters(values as WordListFilter[])}
          disabled={busy}
        />
        {withDifficulty && (
          <NumberInput
            label={t("word_list_minimum_difficulty")}
            min={1}
            max={10}
            step={0.5}
            value={difficulty}
            onChange={setDifficulty}
            disabled={busy}
          />
        )}
        <Group justify="flex-end">
          <Button
            loading={busy}
            disabled={!languages.length || (withDifficulty && !validDifficulty)}
            onClick={() => void download()}
          >
            {t("word_list_export")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
