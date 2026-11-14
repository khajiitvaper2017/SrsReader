import { ReadingCardSelect } from "@/cards/components/ReadingCardSelect";
import {
  ActionIcon,
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
import type { DefinitionEditing } from "@/vocabulary/components/EditableMeanings";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { WordExamples } from "@/examples/components/WordExamples";
import { useState } from "react";
import type { Settings } from "@/settings/model";
import { i18n, number, t } from "@/shared/i18n/i18n";
import { useWords } from "@/vocabulary/hooks/useWords";
import {
  Check,
  Pause,
  Plus,
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
  const [exampleIndex, setExampleIndex] = useState(0);
  const [editing, setEditing] = useState<DefinitionEditing>(null);
  const contextIndex = exampleIndex % (contexts.length || 1);
  const context = contexts[contextIndex];
  if (!word) return null;
  return (
    <Paper ref={detailRef} mb="md">
      <Stack>
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
              currentSentence={context?.sentence}
              iconOnly
            />
            <FrequencyBadge word={{ ...word, forms: [] }} />
            <AudioButton word={word} settings={settings} onError={setError} />
            <ActionIcon
              title={t("add_custom_definition")}
              aria-label={t("add_custom_definition")}
              variant="subtle"
              onClick={() => setEditing("add")}
            >
              <Plus aria-hidden size={16} />
            </ActionIcon>
            <ActionIcon
              title={t("refresh_from_dictionary")}
              aria-label={t("refresh_from_dictionary")}
              onClick={() => refreshWord()}
              variant="subtle"
            >
              <RefreshCw aria-hidden size={16} />
            </ActionIcon>
            <ActionIcon
              title={t("close_word_details")}
              aria-label={t("close_word_details")}
              onClick={() => setSelected("")}
              variant="subtle"
            >
              <X aria-hidden size={16} />
            </ActionIcon>
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  title={t("actions")}
                  aria-label={t("actions")}
                  variant="subtle"
                >
                  <MoreHorizontal aria-hidden size={16} />
                </ActionIcon>
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
          context={context}
          examples={contexts}
          settings={settings}
          onError={setError}
          editing={editing}
          onEditingChange={setEditing}
        />
        {!contexts.length && (
          <WordExamples key={word.id} word={word} settings={settings} />
        )}
        {context && (
          <ContextSentence
            key={`${word.id}:${contextIndex}`}
            word={word}
            context={context}
            settings={settings}
            onError={setError}
            onNext={
              contexts.length > 1
                ? () => setExampleIndex((contextIndex + 1) % contexts.length)
                : undefined
            }
          />
        )}
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
      </Stack>
    </Paper>
  );
}
