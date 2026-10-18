import { Download, LoaderCircle } from "lucide-react";
import { t, i18n, downloadSize } from "./i18n";
import { languageCode, languageName, supportedLanguages } from "./languages";
import { useState } from "react";
import catalog from "./frequency-catalog.json";

export type FrequencyDownload = (typeof catalog)[number];
export const frequencyDownloadUrl = (file: string) =>
  `https://github.com/StefanVukovic99/leipzig-to-yomitan/releases/download/v2024-08-31-18-57-16-00-00/${encodeURIComponent(file)}`;
const downloads = catalog.filter((entry) =>
  supportedLanguages.includes(languageCode(entry.code)),
);
const languages = [...new Set(downloads.map((entry) => entry.code))];
const compareNames = (a: FrequencyDownload, b: FrequencyDownload) =>
  languageName(a.code).localeCompare(
    languageName(b.code),
    i18n.resolvedLanguage,
  ) ||
  a.source.localeCompare(b.source, i18n.resolvedLanguage, { numeric: true }) ||
  a.region.localeCompare(b.region, i18n.resolvedLanguage);
const typeLabels: Record<string, string> = {
  Community: "corpus_community",
  Mixed: "corpus_mixed",
  News: "corpus_news",
  Web: "corpus_web",
  Wikipedia: "corpus_wikipedia",
  Literature: "corpus_literature",
  Public: "corpus_public",
};

export function FrequencyBrowser({
  language,
  busy,
  onImport,
}: {
  language: string;
  busy: boolean;
  onImport: (entry: FrequencyDownload) => Promise<void>;
}) {
  const [selectedLanguage, setLanguage] = useState(language);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("language");
  const [installing, setInstalling] = useState("");
  const available = downloads.filter(
    (entry) =>
      (!selectedLanguage || entry.code === selectedLanguage) &&
      languageName(entry.code) !== entry.code,
  );
  const types = [...new Set(available.map((entry) => entry.type))].sort();
  const query = search.trim().toLocaleLowerCase();
  const entries = available
    .filter(
      (entry) =>
        (!type || entry.type === type) &&
        `${languageName(entry.code)} ${entry.language} ${entry.source} ${entry.region}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort(
      (a, b) =>
        (sort === "size"
          ? b.size - a.size
          : sort === "type"
            ? t(typeLabels[a.type]!).localeCompare(
                t(typeLabels[b.type]!),
                i18n.resolvedLanguage,
              )
            : 0) || compareNames(a, b),
    );
  async function install(entry: FrequencyDownload) {
    setInstalling(entry.file);
    try {
      await onImport(entry);
    } finally {
      setInstalling("");
    }
  }
  return (
    <details className="dictionary-browser">
      <summary>{t("frequency_dictionaries")}</summary>
      <div className="dictionary-filters">
        <label>
          {t("language")}{" "}
          <select
            aria-label={t("frequency_language")}
            value={selectedLanguage}
            onChange={(event) => {
              setLanguage(event.target.value);
              setType("");
            }}
          >
            <option value="">{t("all_languages")}</option>
            {[...languages]
              .filter((code) => languageName(code) !== code)
              .sort((a, b) =>
                languageName(a).localeCompare(
                  languageName(b),
                  i18n.resolvedLanguage,
                ),
              )
              .map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t("type")}{" "}
          <select
            aria-label={t("corpus_type")}
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">{t("all_types")}</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {t(typeLabels[type]!)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("sort_by")}{" "}
          <select
            aria-label={t("sort_frequency_dictionaries")}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="language">{t("language")}</option>
            <option value="type">{t("type")}</option>
            <option value="size">{t("download_size")}</option>
          </select>
        </label>
        <input
          type="search"
          aria-label={t("search_frequency_dictionaries")}
          placeholder={t("search_corpora_or_regions")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div
        className="dictionary-results"
        aria-label={t("available_frequency_dictionaries")}
      >
        {entries.map((entry) => (
          <div className="dictionary-download" key={entry.file}>
            <div>
              <strong>
                {languageName(entry.code)} · {entry.source}
              </strong>
              <small>
                {entry.region && `${entry.region} · `}
                {downloadSize(entry.size)}
              </small>
            </div>
            <button
              className="icon-button"
              disabled={busy}
              onClick={() => void install(entry)}
              title={t("import_2", {
                language: languageName(entry.code),
                region: entry.region,
                source: entry.source,
              }).replace(/\s+/g, " ")}
              aria-label={t("import_2", {
                language: languageName(entry.code),
                region: entry.region,
                source: entry.source,
              }).replace(/\s+/g, " ")}
            >
              {installing === entry.file ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
            </button>
          </div>
        ))}
        {!entries.length && (
          <p className="dictionary-empty">{t("no_matching_dictionaries")}</p>
        )}
      </div>
    </details>
  );
}
