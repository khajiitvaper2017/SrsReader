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
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronUp, EyeOff } from "lucide-react";

export function Meanings({
  meanings,
  language,
  settings,
  onIgnoreTag,
}: {
  meanings: Meaning[];
  language: string;
  settings: Settings;
  onIgnoreTag?: (tag: string) => void;
}) {
  const {
    expanded,
    setExpanded,
    hasMore,
    visible,
    styles,
    tagDescriptions,
    monolingual,
    definitionLanguages,
  } = useMeanings({ meanings, language, settings, onIgnoreTag });

  return (
    <div className="meanings">
      {visible.map((meaning, i) => (
        <section className="meaning" key={`${meaning.dictionaryId}:${i}`}>
          <div className="meaning-label">
            <span className="dictionary-name">
              {meaning.dictionaryId === "personal"
                ? t("personal_definition")
                : meaning.title}
            </span>
            {meaningTags(meaning).map((tag, j) =>
              onIgnoreTag ? (
                <DropdownMenu.Root key={j} modal={false}>
                  <DropdownMenu.Trigger
                    className="tag tag-action"
                    data-srs-reader=""
                    title={
                      meaning.tagDescriptions?.[tag] ||
                      tagDescriptions[`${meaning.dictionaryId}:${tag}`] ||
                      undefined
                    }
                  >
                    {tag}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="tag-menu"
                      sideOffset={4}
                      collisionPadding={8}
                      aria-label={tag}
                      data-srs-reader=""
                    >
                      <DropdownMenu.Item
                        className="select-option"
                        onSelect={() => onIgnoreTag(tag)}
                      >
                        <EyeOff aria-hidden="true" />{" "}
                        {t("ignore_words_with_tag")}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : (
                <span
                  className="tag"
                  key={j}
                  title={
                    meaning.tagDescriptions?.[tag] ||
                    tagDescriptions[`${meaning.dictionaryId}:${tag}`] ||
                    undefined
                  }
                >
                  {tag}
                </span>
              ),
            )}
          </div>
          <style>
            {scopedStyles(
              styles[meaning.dictionaryId] || "",
              `[data-meaning="${i}"]`,
            )}
          </style>
          <div
            className="dictionary-content"
            data-meaning={i}
            data-reading-language={
              meaning.dictionaryId === "nechybujte"
                ? "cs"
                : meaning.dictionaryId === "personal"
                  ? settings.nativeLanguage
                  : definitionLanguages[meaning.dictionaryId] || ""
            }
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
                <div key={j}>
                  <Structured
                    value={definition}
                    dictionaryId={meaning.dictionaryId}
                  />
                </div>
              ))
            )}
          </div>
          {(monolingual.includes(meaning.dictionaryId) ||
            meaning.dictionaryId === "nechybujte") &&
            language !== settings.nativeLanguage && (
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
              />
            )}
          {meaning.attribution && (
            <div className="attribution">
              {safeUrl(meaning.attribution) || safeUrl(meaning.sourceUrl) ? (
                <a
                  href={
                    safeUrl(meaning.attribution) || safeUrl(meaning.sourceUrl)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {meaning.attribution}
                </a>
              ) : (
                meaning.attribution
              )}
            </div>
          )}
        </section>
      ))}
      {settings.firstDictionaryOnly && hasMore && (
        <button
          className="quiet icon-button dictionary-expand"
          title={expanded ? t("fewer_dictionaries") : t("more_dictionaries")}
          aria-label={
            expanded ? t("fewer_dictionaries") : t("more_dictionaries")
          }
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
