import { useDictionaryTags } from "@/dictionaries/hooks/useDictionaryTags";
import type { Dictionary } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";

export function DictionaryTags({
  dictionaries,
  settings,
  onChange,
}: {
  dictionaries: Dictionary[];
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const { search, setSearch, error, entries } = useDictionaryTags({
    dictionaries,
    settings,
    onChange,
  });

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
