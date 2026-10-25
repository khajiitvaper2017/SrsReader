import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AudioButton } from "@/audio/components/AudioButton";
import { CardDefinitions } from "@/vocabulary/components/CardDefinitions";
import { ContextSentence } from "@/vocabulary/components/ContextSentence";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { WordExamples } from "@/examples/components/WordExamples";
import type { Settings } from "@/settings/model";
import { i18n, number, t } from "@/shared/i18n/i18n";
import { useWords } from "@/vocabulary/hooks/useWords";
import { Check, Pause, Play, RefreshCw, Trash2, X } from "lucide-react";
export function WordDetails({
  settings,
  controller,
}: {
  settings: Settings;
  controller: ReturnType<typeof useWords>;
}) {
  const {
    setSelected,
    setError,
    detailRef,
    word,
    contexts,
    changeRetention,
    refreshWord,
    toggleMastery,
    toggleSuspension,
    deleteWord,
  } = controller;
  if (!word) return null;
  return (
    <Paper ref={detailRef} mb="md">
      <Stack>
        <Group align="center" justify="space-between">
          <ActionIcon
            title={t("close_word_details")}
            aria-label={t("close_word_details")}
            onClick={() => setSelected("")}
            variant="default"
          >
            <X aria-hidden="true" size={16} />
          </ActionIcon>
        </Group>
        <Group align="center" justify="space-between">
          <Title lang={word.language} order={2}>
            {word.lemma}
          </Title>
          <Group gap="xs">
            <FrequencyBadge word={{ ...word, forms: [] }} />
            <AudioButton word={word} settings={settings} onError={setError} />
          </Group>
        </Group>
        <CardDefinitions
          key={word.id}
          id={word.id}
          context={contexts[0]}
          examples={contexts}
          settings={settings}
          onError={setError}
        />
        {!contexts.length && (
          <WordExamples key={word.id} word={word} settings={settings} />
        )}
        {contexts.map((context, i) => (
          <ContextSentence
            key={`${word.id}:${i}`}
            word={word}
            context={context}
            settings={settings}
            onError={setError}
          />
        ))}
        <Group justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("srs_word_retention")}</strong>
            <Text variant="supporting" component="span" display="block">
              {t("srs_override_help")}
            </Text>
          </span>
          <NumberInput
            min={70}
            max={99}
            placeholder={t("srs_global")}
            value={
              word.retentionOverride === null
                ? ""
                : Math.round(word.retentionOverride * 100)
            }
            onChange={changeRetention}
            aria-label={t("srs_word_retention")}
            w={160}
            maw="50%"
          />
        </Group>
        {word.card && (
          <Text variant="supporting">
            {t("srs_lapses", { count: word.card.lapses })}
            {word.leech ? ` · ${t("srs_leech")}` : ""}
          </Text>
        )}
        {word.card && !word.known && (
          <Stack>
            <span>{t("next_review")}</span>
            <strong>
              {word.card.state === 2 || word.card.interday
                ? new Date(word.card.due).toLocaleDateString(
                    i18n.resolvedLanguage,
                  )
                : new Date(word.card.due).toLocaleString(i18n.resolvedLanguage)}
            </strong>
            <span>
              {t("review_history_counts", {
                reviews: number(word.card.reps),
                lapses: number(word.card.lapses),
              })}{" "}
            </span>
          </Stack>
        )}
        <Group align="center">
          <ActionIcon
            title={t("refresh_from_dictionary")}
            aria-label={t("refresh_from_dictionary")}
            onClick={() => refreshWord()}
            variant="subtle"
          >
            <RefreshCw aria-hidden="true" size={16} />
          </ActionIcon>
          <Button
            aria-pressed={word.known}
            onClick={() => toggleMastery()}
            variant="subtle"
          >
            <Check aria-hidden="true" size={16} />
            {word.known ? t("unmaster") : t("master")}
          </Button>
          {!word.known && (
            <Button onClick={() => toggleSuspension()} variant="subtle">
              {word.suspended ? (
                <Play aria-hidden="true" size={16} />
              ) : (
                <Pause aria-hidden="true" size={16} />
              )}{" "}
              {word.suspended ? t("resume") : t("suspend")}
            </Button>
          )}
          <ActionIcon
            title={t("delete_word")}
            aria-label={t("delete_word")}
            onClick={() => deleteWord()}
            variant="subtle"
            color="red"
          >
            <Trash2 aria-hidden="true" size={16} />
          </ActionIcon>
        </Group>
      </Stack>
    </Paper>
  );
}
