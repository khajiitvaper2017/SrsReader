import { ActionIcon, Group, Anchor, Badge, Stack, Text } from "@mantine/core";
import { Structured } from "@/dictionaries/components/StructuredContent";
import { definitionText } from "@/dictionaries/definitions";
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
import { ChevronDown, ChevronUp, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
export function Meanings({
  meanings,
  language,
  settings,
  onIgnoreTag,
  actions,
  grammar,
  expandedDictionaries = [],
  onToggleDictionary,
}: {
  meanings: Meaning[];
  language: string;
  settings: Settings;
  onIgnoreTag?: (tag: string) => void;
  actions?: (meaning: Meaning) => ReactNode;
  grammar?: OccurrenceGrammar;
  expandedDictionaries?: string[];
  onToggleDictionary?: (id: string) => void;
}) {
  const {
    visible: displayed,
    styles,
    tagDescriptions,
    monolingual,
    definitionLanguages,
  } = useMeanings({ meanings, language, settings, onIgnoreTag });
  return (
    <Stack gap="xs">
      {[...new Set(displayed.map((meaning) => meaning.dictionaryId))].map(
        (dictionaryId) => {
          const entries = displayed.filter(
            (meaning) => meaning.dictionaryId === dictionaryId,
          );
          const expanded = expandedDictionaries.includes(dictionaryId);
          const filtered = new Map(
            entries.map((meaning) => [
              meaning,
              filterPrepositionSenses(meaning, grammar),
            ]),
          );
          const title = entries[0]!.title;
          const conflictsExist = entries.some(
            (meaning) =>
              filtered.get(meaning) !== meaning ||
              Object.keys(grammarConflicts(meaning, grammar)).length,
          );
          const visible = expanded
            ? entries
            : entries.filter(
                (meaning) =>
                  !Object.keys(grammarConflicts(meaning, grammar)).length,
              );
          const toggle = conflictsExist && onToggleDictionary && (
            <ActionIcon
              title={t(expanded ? "show_less" : "show_more")}
              aria-label={`${t(expanded ? "show_less" : "show_more")}: ${title}`}
              aria-expanded={expanded}
              onClick={() => onToggleDictionary(dictionaryId)}
              variant="subtle"
              size="sm"
            >
              {expanded ? (
                <ChevronUp aria-hidden="true" size={16} />
              ) : (
                <ChevronDown aria-hidden="true" size={16} />
              )}
            </ActionIcon>
          );
          return (
            <Stack key={dictionaryId} gap="xs" data-dictionary={dictionaryId}>
              {!visible.length && (
                <Group justify="space-between" data-srs-reader>
                  <Text size="xs" c="dimmed">
                    {title}
                  </Text>
                  {toggle}
                </Group>
              )}
              {visible.map((meaning, i) => {
                const index = displayed.indexOf(meaning);
                const meaningActions = actions?.(meaning);
                const definitions = (
                  expanded ? meaning : filtered.get(meaning)!
                ).definitions;
                const conflicts = grammarConflicts(meaning, grammar);
                const tagTitle = (tag: string) =>
                  [
                    meaning.tagDescriptions?.[tag] ||
                      tagDescriptions[`${meaning.dictionaryId}:${tag}`],
                    conflicts[tag],
                  ]
                    .filter(Boolean)
                    .join("\n") || undefined;
                const renderMeaning = (
                  translationButton?: ReactNode,
                  translation?: ReactNode,
                ) => (
                  <Stack key={`${meaning.dictionaryId}:${i}`} gap="xs">
                    <Group
                      gap={4}
                      wrap="nowrap"
                      align="flex-start"
                      data-srs-reader
                    >
                      <Group gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Text component="span" size="xs" c="dimmed">
                          {meaning.dictionaryId === "personal"
                            ? t("personal_definition")
                            : meaning.title}
                        </Text>
                        {meaningTags(meaning).map((tag, j) =>
                          onIgnoreTag ? (
                            <Menu key={j}>
                              <Menu.Target>
                                <Button
                                  variant="light"
                                  size="compact-xs"
                                  data-srs-reader=""
                                  color={conflicts[tag] ? "red" : undefined}
                                  title={tagTitle(tag)}
                                >
                                  {tag}
                                </Button>
                              </Menu.Target>

                              <Menu.Dropdown
                                aria-label={tag}
                                data-srs-reader=""
                              >
                                <Menu.Item onClick={() => onIgnoreTag(tag)}>
                                  <EyeOff aria-hidden="true" size={16} />{" "}
                                  {t("ignore_words_with_tag")}
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          ) : (
                            <Badge
                              key={j}
                              color={conflicts[tag] ? "red" : undefined}
                              title={tagTitle(tag)}
                            >
                              {tag}
                            </Badge>
                          ),
                        )}
                      </Group>
                      {((i === 0 && toggle) ||
                        meaningActions ||
                        translationButton) && (
                        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                          {i === 0 && toggle}
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
                    <Stack
                      data-meaning={index}
                      data-reading-language={
                        meaning.dictionaryId === "nechybujte"
                          ? "cs"
                          : meaning.dictionaryId === "personal"
                            ? settings.nativeLanguage
                            : definitionLanguages[meaning.dictionaryId] || ""
                      }
                      gap="xs"
                      className="dictionary-content"
                      data-hide-sources={
                        settings.hideDictionarySources || undefined
                      }
                    >
                      {["nechybujte", "personal"].includes(
                        meaning.dictionaryId,
                      ) ? (
                        <ol data-sc-content="glosses">
                          {definitions.map((definition, j) => (
                            <li key={j}>
                              <Structured
                                value={definition}
                                dictionaryId={meaning.dictionaryId}
                              />
                            </li>
                          ))}
                        </ol>
                      ) : (
                        definitions.map((definition: Definition, j) => (
                          <Stack key={j} gap="xs">
                            <Structured
                              value={definition}
                              dictionaryId={meaning.dictionaryId}
                            />
                          </Stack>
                        ))
                      )}
                    </Stack>
                    {translation}
                    {meaning.attribution &&
                      (!settings.hideDictionarySources ||
                        !(
                          safeUrl(meaning.attribution) ||
                          safeUrl(meaning.sourceUrl)
                        )) && (
                        <Group gap={4} data-srs-reader>
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
                return (monolingual.includes(meaning.dictionaryId) ||
                  meaning.dictionaryId === "nechybujte") &&
                  language !== settings.nativeLanguage ? (
                  <TextTranslation
                    compact
                    key={`${meaning.dictionaryId}:${i}:${settings.nativeLanguage}`}
                    text={definitions
                      .map((definition, index) => {
                        const text = definitionText(definition)
                          .replace(/[ \t]+/g, " ")
                          .trim();
                        return text ? `${index + 1}. ${text}` : "";
                      })
                      .filter(Boolean)
                      .join("\n")}
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
