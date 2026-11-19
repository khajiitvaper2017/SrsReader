import { Button, Stack, Text, Textarea } from "@mantine/core";
import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { reviewAnswerMaxLength, type Note, type NoteType } from "@/cards/model";
import { saveNoteFields } from "@/cards/storage";
import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { rpc } from "@/platform/messaging/send";

function FieldsForm({
  note,
  noteType,
  onSaved,
}: {
  note: Note;
  noteType: NoteType;
  onSaved?: () => void;
}) {
  const [fields, setFields] = useState(note.fields);
  const [hint, setHint] = useState(note.hint ?? "");
  const [reviewAnswer, setReviewAnswer] = useState(note.reviewAnswer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labels: Record<string, string> = {
    Word: t("card_field_word"),
    Reading: t("card_field_reading"),
    Definitions: t("card_field_definitions"),
    Sentence: t("card_field_sentence"),
    SentenceFurigana: t("card_field_sentenceFurigana"),
    Translation: t("card_field_translation"),
    WordAudio: t("card_field_wordAudio"),
    SentenceAudio: t("card_field_sentenceAudio"),
    Image: t("card_field_image"),
    Examples: t("card_field_examples"),
  };
  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveNoteFields(note.id, { fields, hint, reviewAnswer });
      await rpc({ action: "invalidate" });
      onSaved?.();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="xs">
      <Text variant="supporting">{t("card_fields_html_help")}</Text>
      <ErrorBox error={error} />
      <Textarea
        label={t("review_answer")}
        description={t("review_answer_help")}
        value={reviewAnswer}
        disabled={busy}
        maxLength={reviewAnswerMaxLength}
        autosize
        maxRows={5}
        onChange={(event) => setReviewAnswer(event.currentTarget.value)}
      />
      {noteType.bindings.hint === undefined && (
        <Textarea
          label={t("card_field_hint")}
          description={t("card_field_hint_help")}
          value={hint}
          disabled={busy}
          autosize
          maxRows={5}
          onChange={(event) => setHint(event.currentTarget.value)}
        />
      )}
      {noteType.fields.map((field, index) => (
        <Textarea
          key={index}
          label={
            index === noteType.bindings.hint
              ? t("card_field_hint")
              : noteType.id.startsWith("reader:")
                ? labels[field.name] || field.label || field.name
                : field.label || field.name
          }
          description={
            index === noteType.bindings.hint
              ? t("card_field_hint_help")
              : undefined
          }
          value={fields[index] || ""}
          disabled={busy}
          autosize
          minRows={2}
          maxRows={10}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setFields((current) =>
              current.map((field, i) => (i === index ? value : field)),
            );
          }}
        />
      ))}
      <Button
        loading={busy}
        disabled={
          hint.trim() === (note.hint ?? "") &&
          reviewAnswer.trim() === (note.reviewAnswer ?? "") &&
          JSON.stringify(fields) === JSON.stringify(note.fields)
        }
        onClick={() => void save()}
      >
        {t("save")}
      </Button>
    </Stack>
  );
}

export function NoteFieldsEditor({
  noteId,
  onSaved,
}: {
  noteId: string;
  onSaved?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ note: Note; noteType: NoteType }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const note = await db.notes.get(noteId);
      const noteType = note && (await db.noteTypes.get(note.noteTypeId));
      return note && noteType ? { note, noteType } : undefined;
    }).subscribe({
      next: setLoaded,
      error: (error: Error) => setError(error.message),
    });
    return () => subscription.unsubscribe();
  }, [noteId]);
  return (
    <Stack>
      <ErrorBox error={error} />
      {loaded?.note.id === noteId && (
        <FieldsForm
          key={`${loaded.note.id}:${loaded.noteType.id}`}
          {...loaded}
          onSaved={onSaved}
        />
      )}
    </Stack>
  );
}
