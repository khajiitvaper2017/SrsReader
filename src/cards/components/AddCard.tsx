import { Button, Select, Stack, Text } from "@mantine/core";
import { Plus } from "lucide-react";
import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import type { CardDocument } from "@/cards/model";
import { canChooseCardGender } from "@/cards/storage";
import { db } from "@/platform/database/db";
import { vocabularyClient } from "@/vocabulary/client";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { t } from "@/shared/i18n/i18n";

type Gender = "Masc" | "Fem" | "Neut";

export function AddCard({
  document,
  onCreated,
}: {
  document: CardDocument;
  onCreated?: () => void;
}) {
  const [canChooseGender, setCanChooseGender] = useState(false);
  const [gender, setGender] = useState<Gender>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState("");
  const wordId = document.note.wordId;
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const word = wordId ? await db.vocabulary.get(wordId) : undefined;
      return !!word && canChooseCardGender(document, word);
    }).subscribe({
      next: setCanChooseGender,
      error: (error: Error) => setError(error.message),
    });
    return () => subscription.unsubscribe();
  }, [wordId, document.noteType.id]);
  async function create() {
    if (!wordId) return;
    setBusy(true);
    setCreated(false);
    setError("");
    try {
      await vocabularyClient({
        action: "createWordCard",
        id: wordId,
        sourceCardId: document.card.id,
        gender: canChooseGender ? gender : undefined,
      });
      setCreated(true);
      onCreated?.();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!wordId) return null;
  return (
    <Stack gap="xs">
      <Text variant="supporting">{t("card_add_help")}</Text>
      {canChooseGender && (
        <Select
          label={t("card_add_gender")}
          value={gender ?? "current"}
          allowDeselect={false}
          disabled={busy}
          data={[
            { value: "current", label: t("card_add_gender_current") },
            { value: "Masc", label: t("card_add_gender_masculine") },
            { value: "Fem", label: t("card_add_gender_feminine") },
            { value: "Neut", label: t("card_add_gender_neuter") },
          ]}
          onChange={(value) =>
            setGender(
              value === "Masc" || value === "Fem" || value === "Neut"
                ? value
                : undefined,
            )
          }
        />
      )}
      <ErrorBox error={error} />
      {created && <Text role="status">{t("card_add_success")}</Text>}
      <Button
        loading={busy}
        leftSection={<Plus aria-hidden size={16} />}
        onClick={() => void create()}
      >
        {t("card_add")}
      </Button>
    </Stack>
  );
}
