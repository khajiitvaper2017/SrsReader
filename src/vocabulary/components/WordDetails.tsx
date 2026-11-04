import { ReadingCardSelect } from "@/cards/components/ReadingCardSelect";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Flex,
  NumberInput,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { CardEditor } from "@/vocabulary/components/CardEditor";
import { CardFields } from "@/vocabulary/components/CardFields";
import { AudioButton } from "@/audio/components/AudioButton";
import { CardDefinitions } from "@/vocabulary/components/CardDefinitions";
import { ContextSentence } from "@/vocabulary/components/ContextSentence";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { WordExamples } from "@/examples/components/WordExamples";
import type { Settings } from "@/settings/model";
import { i18n, number, t } from "@/shared/i18n/i18n";
import { useWords } from "@/vocabulary/hooks/useWords";
import {
  Check,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  X,
  MoreHorizontal,
} from "lucide-react";
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
            <CardEditor
              key={word.id}
              word={word}
              contexts={contexts}
              nativeLanguage={settings.nativeLanguage}
            />
            <FrequencyBadge word={{ ...word, forms: [] }} />
            <AudioButton word={word} settings={settings} onError={setError} />
          </Group>
        </Group>
        <ReadingCardSelect
          word={word}
          onChanged={controller.load}
          onError={setError}
        />
        <CardFields fields={word.customFields} />
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
        <Flex
          direction={{ base: "column", xs: "row" }}
          gap="sm"
          align={{ base: "stretch", xs: "center" }}
        >
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
            w={{ base: "100%", xs: 160 }}
          />
        </Flex>
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
                ? new Date(word.card.dueAt).toLocaleDateString(
                    i18n.resolvedLanguage,
                  )
                : new Date(word.card.dueAt).toLocaleString(
                    i18n.resolvedLanguage,
                  )}
            </strong>
            <span>
              {t("review_history_counts", {
                reviews: number(word.card.reps),
                lapses: number(word.card.lapses),
              })}{" "}
            </span>
          </Stack>
        )}
        <Group justify="space-between" wrap="nowrap">
          <ActionIcon
            title={t("refresh_from_dictionary")}
            aria-label={t("refresh_from_dictionary")}
            onClick={() => refreshWord()}
          >
            <RefreshCw aria-hidden="true" size={16} />
          </ActionIcon>
          <Menu>
            <Menu.Target>
              <Button leftSection={<MoreHorizontal size={16} />}>
                {t("actions")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Check size={16} />}
                onClick={() => toggleMastery()}
              >
                {word.known ? t("unmaster") : t("master")}
              </Menu.Item>
              {!word.known && (
                <Menu.Item
                  leftSection={
                    word.suspended ? <Play size={16} /> : <Pause size={16} />
                  }
                  onClick={() => toggleSuspension()}
                >
                  {word.suspended ? t("resume") : t("suspend")}
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<Trash2 size={16} />}
                onClick={() => deleteWord()}
              >
                {t("delete_word")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Stack>
    </Paper>
  );
}
