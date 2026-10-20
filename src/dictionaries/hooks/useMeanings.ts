import type { Meaning } from "@/dictionaries/model";
import { dictionaryTags, loadDictionaries } from "@/dictionaries/storage";
import type { Settings } from "@/settings/model";
import { useEffect, useState } from "react";

export function useMeanings({
  meanings,
  language,
  settings,
}: {
  meanings: Meaning[];
  language: string;
  settings: Settings;
  onIgnoreTag?: (tag: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstDictionary = meanings.find(
    (meaning) => meaning.definitions.length,
  )?.dictionaryId;
  const hasMore = meanings.some(
    (meaning) =>
      meaning.definitions.length && meaning.dictionaryId !== firstDictionary,
  );
  const visible =
    settings.firstDictionaryOnly && !expanded
      ? meanings.filter((meaning) => meaning.dictionaryId === firstDictionary)
      : meanings;
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [tagDescriptions, setTagDescriptions] = useState<
    Record<string, string>
  >({});
  const [monolingual, setMonolingual] = useState<string[]>([]);
  const [definitionLanguages, setDefinitionLanguages] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    setExpanded(false);
    let alive = true;
    void loadDictionaries(meanings.map((m) => m.dictionaryId)).then(
      async (rows) => {
        const tags = await dictionaryTags(
          rows.filter((row) => row !== undefined).map((row) => row.revisionId),
        );
        if (alive) {
          setDefinitionLanguages(
            Object.fromEntries(
              rows
                .filter((row) => row !== undefined)
                .map((row) => [row.id, row.target]),
            ),
          );
          setTagDescriptions(
            Object.fromEntries(
              rows
                .filter((row) => row !== undefined)
                .flatMap((row) =>
                  tags
                    .filter(
                      (tag) =>
                        tag.revisionId === row.revisionId &&
                        tag.description &&
                        tag.description !== tag.name,
                    )
                    .map((tag) => [
                      `${row.id}:${tag.name}`,
                      tag.description || tag.name,
                    ]),
                ),
            ),
          );
          setStyles(
            Object.fromEntries(
              rows.filter((d) => d !== undefined).map((d) => [d.id, d.styles]),
            ),
          );
          setMonolingual(
            rows
              .filter((d) => d?.language === language && d.target === language)
              .map((d) => d!.id),
          );
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [meanings, language, settings.interfaceLanguage, settings.nativeLanguage]);
  return {
    expanded,
    setExpanded,
    hasMore,
    visible,
    styles,
    tagDescriptions,
    monolingual,
    definitionLanguages,
  };
}
