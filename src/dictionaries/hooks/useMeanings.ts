import type { Dictionary, Meaning } from "@/dictionaries/model";
import { dictionaryTags, listDictionaries } from "@/dictionaries/storage";
import { displayedMeanings } from "@/dictionaries/display";
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
}) {
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const visible = displayedMeanings(meanings, settings, dictionaries);
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [tagDescriptions, setTagDescriptions] = useState<
    Record<string, string>
  >({});
  const [monolingual, setMonolingual] = useState<string[]>([]);
  const [definitionLanguages, setDefinitionLanguages] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    let alive = true;
    void listDictionaries(settings).then(async (rows) => {
      const tags = await dictionaryTags(
        rows.filter((row) => row !== undefined).map((row) => row.revisionId),
      );
      if (alive) {
        setDictionaries(rows);
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
    });
    return () => {
      alive = false;
    };
  }, [meanings, language, settings]);
  return {
    visible,
    styles,
    tagDescriptions,
    monolingual,
    definitionLanguages,
  };
}
