import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { t } from "@/shared/i18n/i18n";
import { srsClient } from "@/srs/client";
import { deckPathLabel } from "@/srs/deck-tree";
import {
  deckPreferences,
  deckReviewSettingsSchema,
  type DeckReviewSettings,
  type SchedulingPreferences,
} from "@/srs/preferences";

const numbers = [
  ["newLimit", "new_words_per_day", 0, 10000],
  ["reviewLimit", "srs_review_limit", 0, undefined],
  ["retention", "desired_retention", 70, 99],
  ["maximumInterval", "deck_maximum_interval", 1, 36500],
  ["leechThreshold", "srs_leech_threshold", 0, undefined],
] as const;
const orders = [
  ["newGatherOrder", "srs_new_gather_order"],
  ["newSortOrder", "srs_new_sort_order"],
  ["newReviewOrder", "srs_new_review_order"],
  ["interdayReviewOrder", "srs_interday_review_order"],
  ["reviewSortOrder", "srs_review_sort_order"],
] as const;

export function DeckReviewEditor({
  deck,
  defaults,
  onClose,
  onSaved,
}: {
  deck: {
    id: string;
    name: string;
    language: string;
    reviewSettings?: DeckReviewSettings;
  };
  defaults: SchedulingPreferences;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [custom, setCustom] = useState(deck.reviewSettings !== undefined);
  const [overrides, setOverrides] = useState(deck.reviewSettings ?? {});
  const [draft, setDraft] = useState<
    Partial<Record<keyof DeckReviewSettings, string | number>>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const values = deckPreferences(defaults, overrides);
  const parsed = deckReviewSettingsSchema.safeParse({
    ...overrides,
    ...Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [
        key,
        key === "learningSteps" || key === "relearningSteps"
          ? String(value).trim().split(/\s+/).filter(Boolean)
          : key === "reviewLimit" && value === ""
            ? null
            : value === ""
              ? NaN
              : Number(value) / (key === "retention" ? 100 : 1),
      ]),
    ),
  });
  const invalid = custom && !parsed.success;
  async function save() {
    if (busy || invalid) return;
    setBusy(true);
    setError("");
    try {
      await srsClient({
        action: "saveDeckReviewSettings",
        deckId: deck.id,
        language: deck.language,
        reviewSettings: custom ? parsed.data! : null,
      });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      opened
      size="lg"
      title={t("deck_review_settings")}
      onClose={() => {
        if (!busy) onClose();
      }}
      withCloseButton={!busy}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      closeButtonProps={{ "aria-label": t("close"), size: "xl" }}
    >
      <Stack
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <ErrorBox error={error} />
        <Text fw={500}>{deckPathLabel(deck.name)}</Text>
        <SegmentedControl
          fullWidth
          aria-label={t("deck_review_settings")}
          value={custom ? "custom" : "default"}
          data={[
            { value: "default", label: t("deck_review_default") },
            { value: "custom", label: t("custom") },
          ]}
          onChange={(value) => setCustom(value === "custom")}
          disabled={busy}
        />
        <Text variant="supporting">
          {t(custom ? "deck_review_custom_help" : "deck_review_default_help")}
        </Text>
        {custom && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {numbers.map(([key, label, min, max]) => (
                <NumberInput
                  key={key}
                  label={t(label)}
                  value={
                    draft[key] ??
                    (key === "retention"
                      ? Math.round(values.retention * 10000) / 100
                      : (values[key] ?? ""))
                  }
                  min={min}
                  max={max}
                  allowDecimal={key === "retention"}
                  decimalScale={key === "retention" ? 2 : 0}
                  suffix={key === "retention" ? "%" : undefined}
                  placeholder={
                    key === "reviewLimit" ? t("srs_unlimited") : undefined
                  }
                  disabled={busy}
                  onChange={(value) => setDraft({ ...draft, [key]: value })}
                />
              ))}
              <Select
                label={t("srs_leech_action")}
                allowDeselect={false}
                disabled={busy}
                value={values.leechAction}
                data={[
                  { value: "suspend", label: t("suspend") },
                  { value: "mark", label: t("srs_mark_only") },
                ]}
                onChange={(value) => {
                  if (value === "suspend" || value === "mark")
                    setOverrides({ ...overrides, leechAction: value });
                }}
              />
              {(["learningSteps", "relearningSteps"] as const).map((key) => (
                <TextInput
                  key={key}
                  label={t(
                    key === "learningSteps"
                      ? "srs_learning_steps"
                      : "srs_relearning_steps",
                  )}
                  value={draft[key] ?? values[key].join(" ")}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.currentTarget.value })
                  }
                />
              ))}
            </SimpleGrid>
            <Text variant="supporting">{t("srs_steps_help")}</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {orders.map(([key, label]) => (
                <Select
                  key={key}
                  label={t(label)}
                  value={values[key]}
                  allowDeselect={false}
                  disabled={busy}
                  data={deckReviewSettingsSchema.shape[key]
                    .unwrap()
                    .options.map((value) => ({
                      value,
                      label: t(`srs_order_${value}`),
                    }))}
                  onChange={(value) => {
                    if (value) setOverrides({ ...overrides, [key]: value });
                  }}
                />
              ))}
            </SimpleGrid>
          </>
        )}
        {invalid && <ErrorBox error={t("deck_review_invalid")} />}
        <Group justify="flex-end">
          <Button onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            variant="filled"
            loading={busy}
            disabled={invalid}
          >
            {t("save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
