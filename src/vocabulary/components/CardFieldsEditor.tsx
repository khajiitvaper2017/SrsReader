import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { vocabularyClient } from "@/vocabulary/client";
import type { WordWithCards } from "@/vocabulary/model";

export function CardFieldsEditor({
  word,
  noteId,
}: {
  word: WordWithCards;
  noteId: string;
}) {
  const [fields, setFields] = useState(word.customFields || []);
  const [saved, setSaved] = useState(JSON.stringify(fields));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function update(index: number, patch: Partial<(typeof fields)[number]>) {
    setFields(
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await vocabularyClient({
        action: "saveCardFields",
        id: word.id,
        noteId,
        fields,
      });
      setSaved(JSON.stringify(fields));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="xs">
      <Title order={3}>{t("card_fields")}</Title>
      <Text variant="supporting">{t("card_fields_help")}</Text>
      <ErrorBox error={error} />
      {fields.map((field, index) => (
        <Stack key={index} gap="xs">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              flex={1}
              miw={0}
              label={t("card_field_name")}
              placeholder={t("card_field_name_hint")}
              value={field.name}
              maxLength={200}
              required
              disabled={busy}
              onChange={(event) =>
                update(index, { name: event.currentTarget.value })
              }
            />
            <ActionIcon
              disabled={busy}
              aria-label={t("card_field_remove")}
              title={t("card_field_remove")}
              color="red"
              onClick={() => setFields(fields.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden size={16} />
            </ActionIcon>
          </Group>
          <Textarea
            label={t("card_field_value")}
            value={field.value}
            maxLength={30000}
            required
            disabled={busy}
            autosize
            minRows={2}
            maxRows={8}
            onChange={(event) =>
              update(index, { value: event.currentTarget.value })
            }
          />
        </Stack>
      ))}
      <Group>
        <Button
          disabled={busy}
          leftSection={<Plus aria-hidden size={16} />}
          onClick={() => setFields([...fields, { name: "", value: "" }])}
        >
          {t("card_field_add")}
        </Button>
        <Button
          loading={busy}
          disabled={
            JSON.stringify(fields) === saved ||
            fields.some((field) => !field.name.trim() || !field.value.trim())
          }
          onClick={() => void save()}
        >
          {t("save")}
        </Button>
      </Group>
    </Stack>
  );
}
