import { useEffect, useState } from "react";
import { t, i18n } from "./i18n";
import { db } from "./db";
import { ErrorBox } from "./ui";
import type { Dictionary, Settings, Tag } from "./model";

export function DictionaryTags({
  dictionaries,
  settings,
  onChange,
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
    void db.tags
      .where("revisionId")
      .anyOf(dictionaries.map((dictionary) => dictionary.revisionId))
      .toArray()
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
  return (
    <details className="dictionary-tags">
      <summary>{t("dictionary_tags")}</summary>
      <p className="setting-footnote">{t("dictionary_tags_help")}</p>
      <ErrorBox error={error} />
      <input
        type="search"
        aria-label={t("search_dictionary_tags")}
        placeholder={t("search_dictionary_tags")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="dictionary-tag-list">
        {entries.map(({ name, description }) => (
          <label className="dictionary-tag-row" key={name}>
            <input
              type="checkbox"
              checked={settings.ignoredTags.includes(name)}
              onChange={(event) =>
                onChange({
                  ignoredTags: event.target.checked
                    ? [...settings.ignoredTags, name]
                    : settings.ignoredTags.filter((tag) => tag !== name),
                })
              }
            />
            <span className="tag" title={description}>
              {name}
            </span>
            <span className="muted">
              {description !== name ? description : ""}
            </span>
          </label>
        ))}
        {!entries.length && (
          <p className="setting-footnote">{t("no_matching_tags")}</p>
        )}
      </div>
    </details>
  );
}
