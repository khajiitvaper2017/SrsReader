import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { languageLabel } from "@/languages/codes";
import { srsClient } from "@/srs/client";
import type { Responses } from "@/srs/contracts";
import { deckContains, deckPathLabel } from "@/srs/deck-tree";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";

export function DeckEditor({
  selection,
  overview,
  onClose,
  onSaved,
}: {
  selection: { language: string; id?: string; parentId: string | null };
  overview: Responses["studyOverview"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = overview
    .find((row) => row.language === selection.language)
    ?.decks.find((deck) => deck.id === selection.id);
  const [language, setLanguage] = useState(selection.language);
  const [name, setName] = useState(initial?.label ?? "");
  const [parentId, setParentId] = useState<string | null>(
    initial?.parentId ?? selection.parentId,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parents = (
    overview.find((row) => row.language === language)?.decks ?? []
  ).filter((deck) => !initial || !deckContains(initial.name, deck.name));
  const invalidName = name.includes("::") || /\p{Cc}/u.test(name);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await srsClient({
        action: "saveDeck",
        language,
        name,
        parentId,
        id: selection.id,
      });
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t(selection.id ? "study_edit_deck" : "study_add_deck")}
      closeButtonProps={{ "aria-label": t("close") }}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      <Stack
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <ErrorBox error={error} />
        <Select
          label={t("language")}
          value={language}
          disabled={busy || !!selection.id}
          data={overview.map((row) => ({
            value: row.language,
            label: languageLabel(row.language),
          }))}
          onChange={(value) => {
            if (value) {
              setLanguage(value);
              setParentId(null);
            }
          }}
        />
        <TextInput
          label={t("study_deck_name")}
          value={name}
          required
          autoFocus
          maxLength={200}
          disabled={busy}
          error={invalidName ? t("study_deck_name_invalid") : undefined}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Select
          label={t("study_parent_deck")}
          value={parentId ?? ""}
          searchable
          disabled={busy}
          data={[
            { value: "", label: t("study_no_parent") },
            ...parents.map((deck) => ({
              value: deck.id,
              label: deckPathLabel(deck.name),
            })),
          ]}
          onChange={(value) => setParentId(value || null)}
        />
        <Text variant="supporting">{t("study_deck_edit_help")}</Text>
        <Group justify="flex-end">
          <Button onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="filled"
            loading={busy}
            disabled={!name.trim() || !language || invalidName}
          >
            {t("save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
