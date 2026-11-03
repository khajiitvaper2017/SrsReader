import { isOnlineDictionary } from "@/dictionaries/online";
import { ActionIcon, Group, Anchor, Badge, Stack, Text } from "@mantine/core";
import { Structured } from "@/dictionaries/components/StructuredContent";
import { mapDefinitionSenses } from "@/dictionaries/definitions";
import { useMeanings } from "@/dictionaries/hooks/useMeanings";
import {
  filterPrepositionSenses,
  grammarConflicts,
} from "@/dictionaries/grammar";
import type { OccurrenceGrammar } from "@/languages/analysis";
import {
  meaningTags,
  type Definition,
  type Meaning,
} from "@/dictionaries/model";
import { safeUrl, scopedStyles } from "@/dictionaries/sanitize";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { TextTranslation } from "@/translation/components/SentenceTranslation";
import { Button, Menu } from "@mantine/core";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
export function Meanings({
  meanings,
  language,
  settings,
  onIgnoreTag,
  actions,
  grammar,
  expandedDictionaries = [],
  hiddenDictionaries = [],
  onToggleDictionary,
  onToggleHiddenDictionary,
  renderExample,
}: {
  meanings: Meaning[];
  language: string;
  settings: Settings;
  onIgnoreTag?: (tag: string) => void;
  actions?: (meaning: Meaning) => ReactNode;
  grammar?: OccurrenceGrammar;
  expandedDictionaries?: string[];
  hiddenDictionaries?: string[];
  onToggleDictionary?: (id: string) => void;
  onToggleHiddenDictionary?: (id: string) => void;
  /** Render a matching sentence below a dictionary entry. */
  renderExample?: (meaning: Meaning) => ReactNode;
}) {
  const {
    visible: displayed,
    styles,
    tagDescriptions,
    monolingual,
    definitionLanguages,
  } = useMeanings({ meanings, language, settings });
  const conflictsByMeaning = new Map(
    displayed.map((meaning) => [meaning, grammarConflicts(meaning, grammar)]),
  );
  const dictionaries = [
    ...new Set(displayed.map((meaning) => meaning.dictionaryId)),
  ]
    .map((dictionaryId) => {
      const entries = displayed.filter(
        (meaning) => meaning.dictionaryId === dictionaryId,
      );
      const expanded = expandedDictionaries.includes(dictionaryId);
      const hidden = hiddenDictionaries.includes(dictionaryId);
      const filtered = new Map(
        entries.map((meaning) => [
          meaning,
          filterPrepositionSenses(meaning, grammar),
        ]),
      );
      const title = entries[0]!.title;
      const matching = entries.filter(
        (meaning) => !Object.keys(conflictsByMeaning.get(meaning)!).length,
      );
      const conflictsExist =
        matching.length !== entries.length ||
        entries.some((meaning) => filtered.get(meaning) !== meaning);
      const visible = hidden ? [] : expanded ? entries : matching;
      return {
        dictionaryId,
        entries,
        expanded,
        hidden,
        filtered,
        title,
        conflictsExist,
        visible,
      };
    })
    .sort((a, b) => Number(!a.visible.length) - Number(!b.visible.length));
  return (
    <Stack gap="xs">
      {dictionaries.map(
        ({
          dictionaryId,
          entries,
          expanded,
          hidden,
          filtered,
          title,
          conflictsExist,
          visible,
        }) => {
          const toggle = conflictsExist && onToggleDictionary && (
            <ActionIcon
              title={t(expanded ? "show_less" : "show_more")}
              aria-label={`${t(expanded ? "show_less" : "show_more")}: ${title}`}
              aria-expanded={expanded}
              onClick={() => onToggleDictionary(dictionaryId)}
              variant="subtle"
            >
              {expanded ? (
                <ChevronUp aria-hidden="true" size={16} />
              ) : (
                <ChevronDown aria-hidden="true" size={16} />
              )}
            </ActionIcon>
          );
          const visibility = onToggleHiddenDictionary && (
            <ActionIcon
              title={t(hidden ? "show_dictionary" : "hide_dictionary")}
              aria-label={`${t(hidden ? "show_dictionary" : "hide_dictionary")}: ${title}`}
              aria-expanded={!hidden}
              onClick={() => onToggleHiddenDictionary(dictionaryId)}
              variant="subtle"
            >
              {hidden ? (
                <Eye aria-hidden size={16} />
              ) : (
                <EyeOff aria-hidden size={16} />
              )}
            </ActionIcon>
          );
          const renderTags = (meaning: Meaning) => {
            const conflicts = conflictsByMeaning.get(meaning)!;
            const tagTitle = (tag: string) =>
              [
                meaning.tagDescriptions?.[tag] ||
                  tagDescriptions[`${meaning.dictionaryId}:${tag}`],
                conflicts[tag],
              ]
                .filter(Boolean)
                .join("\n") || undefined;
            return (
              <>
                {meaningTags(meaning).map((tag, j) =>
                  onIgnoreTag ? (
                    <Menu key={j}>
                      <Menu.Target>
                        <Button
                          variant="light"
                          size="compact-xs"
                          h={18}
                          mih={0}
                          px={4}
                          py={0}
                          radius="xl"
                          data-srs-reader=""
                          color={conflicts[tag] ? "red" : undefined}
                          title={tagTitle(tag)}
                        >
                          {tag}
                        </Button>
                      </Menu.Target>

                      <Menu.Dropdown aria-label={tag} data-srs-reader="">
                        <Menu.Item onClick={() => onIgnoreTag(tag)}>
                          <EyeOff aria-hidden="true" size={16} />{" "}
                          {t("ignore_words_with_tag")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  ) : (
                    <Badge
                      px={4}
                      radius="xl"
                      key={j}
                      color={conflicts[tag] ? "red" : undefined}
                      title={tagTitle(tag)}
                    >
                      {tag}
                    </Badge>
                  ),
                )}
              </>
            );
          };
          return (
            <Stack key={dictionaryId} data-dictionary={dictionaryId} gap="xs">
              {!visible.length && (
                <Group justify="space-between" data-srs-reader>
                  <Group style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="supporting">{title}</Text>
                    {entries.map((meaning, index) => (
                      <Group key={index}>{renderTags(meaning)}</Group>
                    ))}
                  </Group>
                  <Group gap={0} wrap="nowrap">
                    {toggle}
                    {visibility}
                  </Group>
                </Group>
              )}
              {visible.map((meaning, i) => {
                const index = displayed.indexOf(meaning);
                const meaningActions = actions?.(meaning);
                const definitions =
                  meaning.customDefinitions ||
                  (expanded ? meaning : filtered.get(meaning)!).definitions;
                const senses: string[] = [];
                mapDefinitionSenses(definitions, (text) => {
                  senses.push(text);
                  return text;
                });
                const renderDefinitions = (values: Definition[]) => (
                  <Stack
                    gap="xs"
                    data-meaning={index}
                    data-reading-language={
                      meaning.dictionaryId === "personal" ||
                      meaning.customDefinitions
                        ? settings.nativeLanguage
                        : isOnlineDictionary(meaning.dictionaryId)
                          ? meaning.dictionaryId === "nechybujte"
                            ? "cs"
                            : "en"
                          : definitionLanguages[meaning.dictionaryId] || ""
                    }
                    className="dictionary-content"
                    data-hide-sources={
                      settings.hideDictionarySources || undefined
                    }
                  >
                    {meaning.customDefinitions ||
                    isOnlineDictionary(meaning.dictionaryId) ||
                    meaning.dictionaryId === "personal" ? (
                      <ol data-sc-content="glosses">
                        {values.map((definition, j) => (
                          <li key={j}>
                            <Structured
                              value={definition}
                              dictionaryId={meaning.dictionaryId}
                            />
                          </li>
                        ))}
                      </ol>
                    ) : (
                      values.map((definition: Definition, j) => (
                        <Stack key={j} gap="xs">
                          <Structured
                            value={definition}
                            dictionaryId={meaning.dictionaryId}
                          />
                        </Stack>
                      ))
                    )}
                  </Stack>
                );
                const renderMeaning = (
                  translationButton?: ReactNode,
                  translation?: ReactNode,
                  failure?: ReactNode,
                ) => (
                  <Stack key={index} gap="xs">
                    <Group wrap="nowrap" align="flex-start" data-srs-reader>
                      <Group style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="supporting" component="span">
                          {meaning.dictionaryId === "personal"
                            ? t("custom")
                            : meaning.title}
                        </Text>
                        {renderTags(meaning)}
                        {meaning.customDefinitions && (
                          <Badge>{t("edited")}</Badge>
                        )}
                      </Group>
                      {((i === 0 && toggle) ||
                        (i === 0 && visibility) ||
                        meaningActions ||
                        translationButton) && (
                        <Group gap={0} wrap="nowrap" style={{ flexShrink: 0 }}>
                          {i === 0 && toggle}
                          {i === 0 && visibility}
                          {meaningActions}
                          {translationButton}
                        </Group>
                      )}
                    </Group>
                    <style>
                      {scopedStyles(
                        styles[meaning.dictionaryId] || "",
                        `[data-meaning="${index}"]`,
                      )}
                    </style>
                    {translation || renderDefinitions(definitions)}
                    {failure}
                    {renderExample?.(meaning)}
                    {meaning.attribution &&
                      (!settings.hideDictionarySources ||
                        !(
                          safeUrl(meaning.attribution) ||
                          safeUrl(meaning.sourceUrl)
                        )) && (
                        <Group data-srs-reader>
                          {safeUrl(meaning.attribution) ||
                          safeUrl(meaning.sourceUrl) ? (
                            <Anchor
                              href={
                                safeUrl(meaning.attribution) ||
                                safeUrl(meaning.sourceUrl)
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {meaning.attribution}
                            </Anchor>
                          ) : (
                            meaning.attribution
                          )}
                        </Group>
                      )}
                  </Stack>
                );
                return !meaning.customDefinitions &&
                  (monolingual.includes(meaning.dictionaryId) ||
                    meaning.dictionaryId === "nechybujte") &&
                  !settings.nativeLanguages.includes(language) ? (
                  <TextTranslation
                    compact
                    autoTranslate={settings.autoTranslateDefinitions}
                    key={`${index}:${settings.nativeLanguage}:${JSON.stringify(senses)}`}
                    text={senses}
                    renderTranslation={(parts) => {
                      let senseIndex = 0;
                      return renderDefinitions(
                        mapDefinitionSenses(definitions, () => ({
                          tag: "span",
                          lang: settings.nativeLanguage,
                          data: { content: "translation" },
                          content: parts[senseIndex++]!,
                        })),
                      );
                    }}
                    language={language}
                    settings={settings}
                    label={t("translate_definition")}
                  >
                    {renderMeaning}
                  </TextTranslation>
                ) : (
                  renderMeaning()
                );
              })}
            </Stack>
          );
        },
      )}
    </Stack>
  );
}
