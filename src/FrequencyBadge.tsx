import { t, number } from "./i18n";
import { useCallback, useEffect, useState } from "react";
import { harmonicRank, wordFrequencies } from "./frequency";
import type { LookupWord } from "./model";
import { useChanges } from "./ui";

export function FrequencyBadge({ word }: { word: LookupWord }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof wordFrequencies>>>(
    [],
  );
  const [revision, setRevision] = useState(0);
  useChanges(useCallback(() => setRevision((value) => value + 1), []));
  useEffect(() => {
    let alive = true;
    setRows([]);
    void wordFrequencies(word)
      .then((rows) => {
        if (alive) setRows(rows);
      })
      .catch(console.warn);
    return () => {
      alive = false;
    };
  }, [word.lemma, word.reading, word.language, revision]);
  if (!rows.length) return null;
  const rank = Math.round(harmonicRank(rows.map((row) => row.rank)));
  const details = rows
    .map((row) => `${row.title}: ${number(row.rank)}`)
    .join("\n");
  return (
    <details className="frequency-badge" data-srs-reader>
      <summary
        title={`${rows.length > 1 ? t("combined_rank_harmonic_mean") : ""}${details}`}
      >
        {t("freq")} {number(rank)}
      </summary>
      <div className="frequency-ranks">
        {rows.map((row) => (
          <div key={row.title}>
            <span title={row.title}>{row.title}</span>
            <strong>{number(row.rank)}</strong>
          </div>
        ))}
        {rows.length > 1 && (
          <small className="muted">
            {t("combined_using_the_harmonic_mean")}
          </small>
        )}
      </div>
    </details>
  );
}
