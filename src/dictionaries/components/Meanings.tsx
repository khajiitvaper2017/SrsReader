import { Group, Anchor, Badge, Stack, Text } from "@mantine/core";
import { Structured } from "@/dictionaries/components/StructuredContent";
import { definitionText } from "@/dictionaries/definitions";
import { useMeanings } from "@/dictionaries/hooks/useMeanings";
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
import { EyeOff } from "lucide-react";
import type { ReactNode } from "react";
export function Meanings({
  meanings,
  language,
  settings,
  onIgnoreTag,
  actions,
}: {
  meanings: Meaning[];
  language: string;
  settings: Settings;
  onIgnoreTag?: (tag: string) => void;
  actions?: ReactNode;
}) {
  const { visible, styles, tagDescriptions, monolingual, definitionLanguages } =
    useMeanings({ meanings, language, settings, onIgnoreTag });
  return (
    <Stack gap="xs">
      {visible.map((meaning, i) => {
        const renderMeaning = (
          translationButton?: ReactNode,
          translation?: ReactNode,
        ) => (
          <Stack key={`${meaning.dictionaryId}:${i}`} gap="xs">
            <Group gap={4} wrap="nowrap" align="flex-start" data-srs-reader>
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
                          title={
                            meaning.tagDescriptions?.[tag] ||
                            tagDescriptions[`${meaning.dictionaryId}:${tag}`] ||
                            undefined
                          }
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
                      key={j}
                      title={
                        meaning.tagDescriptions?.[tag] ||
                        tagDescriptions[`${meaning.dictionaryId}:${tag}`] ||
                        undefined
                      }
                    >
                      {tag}
                    </Badge>
                  ),
                )}
              </Group>
              {((i === visible.length - 1 && actions) || translationButton) && (
                <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                  {i === visible.length - 1 && actions}
                  {translationButton}
                </Group>
              )}
            </Group>
            <style>
              {scopedStyles(
                styles[meaning.dictionaryId] || "",
                `[data-meaning="${i}"]`,
              )}
            </style>
            <Stack
              data-meaning={i}
              data-reading-language={
                meaning.dictionaryId === "nechybujte"
                  ? "cs"
                  : meaning.dictionaryId === "personal"
                    ? settings.nativeLanguage
                    : definitionLanguages[meaning.dictionaryId] || ""
              }
              gap="xs"
              className="dictionary-content"
              data-hide-sources={settings.hideDictionarySources || undefined}
            >
              {meaning.dictionaryId === "nechybujte" ? (
                <ol data-sc-content="glosses">
                  {meaning.definitions.map((definition, j) => (
                    <li key={j}>
                      <Structured
                        value={definition}
                        dictionaryId={meaning.dictionaryId}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                meaning.definitions.map((definition: Definition, j) => (
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
                  safeUrl(meaning.attribution) || safeUrl(meaning.sourceUrl)
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
            text={meaning.definitions
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
      {!visible.length && actions && (
        <Group gap={4} justify="flex-end">
          {actions}
        </Group>
      )}
    </Stack>
  );
}
