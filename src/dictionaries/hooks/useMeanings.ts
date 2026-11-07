import type { Dictionary, Meaning } from "@/dictionaries/model";
import { dictionaryTags, listDictionaries } from "@/dictionaries/storage";
import { displayedMeanings } from "@/dictionaries/display";
import type { Settings } from "@/settings/model";
import { useEffect, useMemo, useState } from "react";

type DictionaryMetadata = {
  dictionaries: Dictionary[];
  styles: Record<string, string>;
  tagDescriptions: Record<string, string>;
  definitionLanguages: Record<string, string>;
};
const emptyMetadata: DictionaryMetadata = {
  dictionaries: [],
  styles: {},
  tagDescriptions: {},
  definitionLanguages: {},
};
// Lookup-language overrides retain preferences; new settings snapshots replace them.
const metadataCache = new WeakMap<
  Settings["dictionaryPreferences"],
  { value?: DictionaryMetadata; pending: Promise<DictionaryMetadata> }
>();

export function dictionaryMetadata(
  settings: Settings,
): Promise<DictionaryMetadata> {
  const key = settings.dictionaryPreferences;
  const existing = metadataCache.get(key);
  if (existing) return existing.pending;
  const entry: {
    value?: DictionaryMetadata;
    pending: Promise<DictionaryMetadata>;
  } = {
    pending: listDictionaries(settings).then(async (rows) => {
      const tags = await dictionaryTags(rows.map((row) => row.revisionId));
      return {
        dictionaries: rows,
        definitionLanguages: Object.fromEntries(
          rows.map((row) => [row.id, row.target]),
        ),
        styles: Object.fromEntries(rows.map((row) => [row.id, row.styles])),
        tagDescriptions: Object.fromEntries(
          rows.flatMap((row) =>
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
      };
    }),
  };
  metadataCache.set(key, entry);
  void entry.pending.then(
    (value) => {
      entry.value = value;
    },
    () => metadataCache.delete(key),
  );
  return entry.pending;
}

export function useMeanings({
  meanings,
  language,
  settings,
}: {
  meanings: Meaning[];
  language: string;
  settings: Settings;
}) {
  const [metadata, setMetadata] = useState(
    () =>
      metadataCache.get(settings.dictionaryPreferences)?.value ?? emptyMetadata,
  );
  useEffect(() => {
    let alive = true;
    void dictionaryMetadata(settings).then((value) => {
      if (alive) setMetadata(value);
    });
    return () => {
      alive = false;
    };
  }, [settings]);
  const visible = useMemo(
    () => displayedMeanings(meanings, settings, metadata.dictionaries),
    [meanings, settings, metadata.dictionaries],
  );
  const monolingual = useMemo(
    () =>
      metadata.dictionaries
        .filter(
          (dictionary) =>
            dictionary.language === language && dictionary.target === language,
        )
        .map((dictionary) => dictionary.id),
    [metadata.dictionaries, language],
  );
  return {
    visible,
    styles: metadata.styles,
    tagDescriptions: metadata.tagDescriptions,
    definitionLanguages: metadata.definitionLanguages,
    monolingual,
  };
}
