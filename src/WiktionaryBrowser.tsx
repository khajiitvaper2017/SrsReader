import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { t, i18n, downloadSize } from "./i18n";
import { languageCode, languageName } from "./languages";
import catalogData from "./wiktionary-catalog.json";

export type WiktionaryDownload = {
  source: string;
  target: string;
  type: "main" | "glossary";
  size: number;
};
const types = ["main", "glossary"] as const;
const catalog: Record<
  WiktionaryDownload["type"],
  Record<string, Record<string, number>>
> = catalogData;
const downloads: WiktionaryDownload[] = types.flatMap((type) =>
  Object.entries(catalog[type]).flatMap(([source, targets]) =>
    Object.entries(targets).map(([target, size]) => ({
      source,
      target,
      type,
      size,
    })),
  ),
);
const languages = [
  ...new Set(downloads.map((entry) => languageCode(entry.source))),
];
const typeLabels = {
  main: "dictionary_definitions",
  glossary: "dictionary_translations",
};
export function wiktionaryName(entry: WiktionaryDownload) {
  return `wty-${entry.source}-${entry.target}${entry.type === "glossary" ? "-gloss" : ""}`;
}
export function wiktionaryDownloadUrl(entry: WiktionaryDownload) {
  return `https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/${entry.source}/${entry.target}/${wiktionaryName(entry)}.zip?download=true`;
}
const compareLanguages = (a: string, b: string) =>
  languageName(a).localeCompare(languageName(b), i18n.resolvedLanguage);

export function WiktionaryBrowser({
  language,
  nativeLanguage,
  busy,
  onImport,
}: {
  language: string;
  nativeLanguage: string;
  busy: boolean;
  onImport: (entry: WiktionaryDownload) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(language);
  const [target, setTarget] = useState(
    downloads.some(
      (entry) =>
        (!language || languageCode(entry.source) === language) &&
        languageCode(entry.target) === nativeLanguage,
    )
      ? nativeLanguage
      : "",
  );
  const [type, setType] = useState("");
  const [sort, setSort] = useState("language");
  const [search, setSearch] = useState("");
  const [installing, setInstalling] = useState("");
  const available = open
    ? downloads.filter(
        (entry) =>
          (!source || languageCode(entry.source) === source) &&
          languageName(languageCode(entry.source)) !==
            languageCode(entry.source) &&
          languageName(languageCode(entry.target)) !==
            languageCode(entry.target),
      )
    : [];
  const targets = [
    ...new Set(available.map((entry) => languageCode(entry.target))),
  ];
  const matching = available.filter(
    (entry) => !target || languageCode(entry.target) === target,
  );
  const query = search.trim().toLocaleLowerCase();
  const entries = matching
    .filter(
      (entry) =>
        (!type || entry.type === type) &&
        `${languageName(languageCode(entry.source))} ${languageName(languageCode(entry.target))} ${wiktionaryName(entry)}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort(
      (a, b) =>
        (sort === "size" ? b.size - a.size : 0) ||
        compareLanguages(languageCode(a.source), languageCode(b.source)) ||
        compareLanguages(languageCode(a.target), languageCode(b.target)) ||
        types.indexOf(a.type) - types.indexOf(b.type) ||
        wiktionaryName(a).localeCompare(wiktionaryName(b)),
    );
  async function install(entry: WiktionaryDownload) {
    setInstalling(wiktionaryName(entry));
    try {
      await onImport(entry);
    } finally {
      setInstalling("");
    }
  }
  return (
    <details
      className="dictionary-browser"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{t("wiktionary_dictionaries")}</summary>
      {open && (
        <>
          <div className="dictionary-filters">
            <label>
              {t("study_language")}
              <select
                aria-label={t("dictionary_study_language")}
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setTarget("");
                  setType("");
                }}
              >
                <option value="">{t("all_languages")}</option>
                {[...languages]
                  .filter((code) => languageName(code) !== code)
                  .sort(compareLanguages)
                  .map((code) => (
                    <option key={code} value={code}>
                      {languageName(code)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("definition_language")}
              <select
                aria-label={t("definition_language")}
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value);
                  setType("");
                }}
              >
                <option value="">{t("all_languages")}</option>
                {targets.sort(compareLanguages).map((code) => (
                  <option key={code} value={code}>
                    {languageName(code)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("type")}
              <select
                aria-label={t("dictionary_type")}
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">{t("all_types")}</option>
                {types
                  .filter((type) =>
                    matching.some((entry) => entry.type === type),
                  )
                  .map((type) => (
                    <option key={type} value={type}>
                      {t(typeLabels[type])}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("sort_by")}
              <select
                aria-label={t("sort_dictionaries")}
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="language">{t("language")}</option>
                <option value="size">{t("download_size")}</option>
              </select>
            </label>
            <input
              type="search"
              aria-label={t("search_dictionaries")}
              placeholder={t("search_languages")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div
            className="dictionary-results"
            aria-label={t("available_wiktionary_dictionaries")}
          >
            {entries.map((entry) => (
              <div className="dictionary-download" key={wiktionaryName(entry)}>
                <div>
                  <strong>
                    {languageName(languageCode(entry.source))} →{" "}
                    {languageName(languageCode(entry.target))}
                  </strong>
                  <small>
                    {t(typeLabels[entry.type])} · {downloadSize(entry.size)} ·{" "}
                    {wiktionaryName(entry)}
                  </small>
                </div>
                <button
                  className="icon-button"
                  disabled={busy}
                  onClick={() => void install(entry)}
                  title={t("import_dictionary_named", {
                    title: wiktionaryName(entry),
                  })}
                  aria-label={t("import_dictionary_named", {
                    title: wiktionaryName(entry),
                  })}
                >
                  {installing === wiktionaryName(entry) ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <Download aria-hidden="true" />
                  )}
                </button>
              </div>
            ))}
            {!entries.length && (
              <p className="dictionary-empty">
                {t("no_matching_dictionaries")}
              </p>
            )}
          </div>
        </>
      )}
    </details>
  );
}
