import type { Dictionary, Tag } from "@/dictionaries/model";
import { dictionaryTags } from "@/dictionaries/storage";
import type { Settings } from "@/settings/model";
import { i18n } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";

export function useDictionaryTags({
  dictionaries,
}: {
  dictionaries: Dictionary[];
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void dictionaryTags(dictionaries.map((dictionary) => dictionary.revisionId))
      .then((tags) => {
        if (alive) {
          setTags(tags);
          setError("");
        }
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [dictionaries]);
  const descriptions = new Map<string, Set<string>>();
  for (const tag of tags) {
    const values = descriptions.get(tag.name) || new Set<string>();
    values.add(tag.description || tag.name);
    descriptions.set(tag.name, values);
  }
  const query = search.trim().toLocaleLowerCase();
  const entries = [...descriptions]
    .map(([name, values]) => ({ name, description: [...values].join(" · ") }))
    .filter(({ name, description }) =>
      `${name} ${description}`.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name, i18n.resolvedLanguage));
  return { search, setSearch, error, entries };
}
