import { useState } from "react";
import catalog from "./frequency-catalog.json";

export type FrequencyDownload = (typeof catalog)[number];
export const frequencyDownloadUrl = (file: string) =>
  `https://github.com/StefanVukovic99/leipzig-to-yomitan/releases/download/v2024-08-31-18-57-16-00-00/${encodeURIComponent(file)}`;
const languages = [
  ...new Map(catalog.map((entry) => [entry.code, entry.language])),
].sort((a, b) => a[1].localeCompare(b[1]));
const compareNames = (a: FrequencyDownload, b: FrequencyDownload) =>
  a.language.localeCompare(b.language) ||
  a.source.localeCompare(b.source, "en", { numeric: true }) ||
  a.region.localeCompare(b.region);
function downloadSize(bytes: number) {
  const [value, unit] =
    bytes < 1024
      ? [bytes, "B"]
      : bytes < 1024 ** 2
        ? [bytes / 1024, "KB"]
        : [bytes / 1024 ** 2, "MB"];
  return `${Number(value).toLocaleString("en", { maximumFractionDigits: 2 })} ${unit}`;
}

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
  const available = catalog.filter(
    (entry) => !selectedLanguage || entry.code === selectedLanguage,
  );
  const types = [...new Set(available.map((entry) => entry.type))].sort();
  const query = search.trim().toLocaleLowerCase();
  const entries = available
    .filter(
      (entry) =>
        (!type || entry.type === type) &&
        `${entry.language} ${entry.source} ${entry.region}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort(
      (a, b) =>
        (sort === "size"
          ? a.size - b.size
          : sort === "type"
            ? a.type.localeCompare(b.type)
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
    <details className="frequency-browser">
      <summary>Frequency dictionaries</summary>
      <div className="frequency-filters">
        <label>
          Language
          <select
            aria-label="Frequency language"
            value={selectedLanguage}
            onChange={(event) => {
              setLanguage(event.target.value);
              setType("");
            }}
          >
            <option value="">All languages</option>
            {languages.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            aria-label="Corpus type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select
            aria-label="Sort frequency dictionaries"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="language">Language</option>
            <option value="type">Type</option>
            <option value="size">Download size</option>
          </select>
        </label>
        <input
          type="search"
          aria-label="Search frequency dictionaries"
          placeholder="Search corpora or regions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div
        className="frequency-results"
        aria-label="Available frequency dictionaries"
      >
        {entries.map((entry) => (
          <div className="frequency-option" key={entry.file}>
            <div>
              <strong>
                {entry.language} · {entry.source}
              </strong>
              <small>
                {entry.region && `${entry.region} · `}
                {downloadSize(entry.size)}
              </small>
            </div>
            <button
              disabled={busy}
              onClick={() => void install(entry)}
              aria-label={`Import ${entry.language} ${entry.region} ${entry.source}`.replace(
                /\s+/g,
                " ",
              )}
            >
              {installing === entry.file ? "Importing…" : "Import"}
            </button>
          </div>
        ))}
        {!entries.length && (
          <p className="frequency-empty">No matching dictionaries.</p>
        )}
      </div>
    </details>
  );
}
