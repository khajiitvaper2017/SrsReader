import { Badge, Group, Popover, Stack, Text } from "@mantine/core";
import { harmonicRank, wordFrequencies } from "@/dictionaries/frequency";
import type { LookupWord } from "@/dictionaries/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { number, t } from "@/shared/i18n/i18n";
import { useCallback, useEffect, useState } from "react";
export function FrequencyBadge({
  word,
  loadFrequencies = wordFrequencies,
}: {
  word: LookupWord;
  /** Reuse frequency ranks prepared by the review session. */
  loadFrequencies?: typeof wordFrequencies;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof wordFrequencies>>>(
    [],
  );
  const [revision, setRevision] = useState(0);
  useChanges(
    useCallback(() => setRevision((value) => value + 1), []),
    ["dictionaries", "settings"],
  );
  useEffect(() => {
    let alive = true;
    setRows([]);
    void loadFrequencies(word)
      .then((rows) => {
        if (alive) setRows(rows);
      })
      .catch(console.warn);
    return () => {
      alive = false;
    };
  }, [word.lemma, word.reading, word.language, revision, loadFrequencies]);
  if (!rows.length) return null;
  const rank = Math.round(harmonicRank(rows.map((row) => row.rank)));
  const details = rows
    .map((row) => `${row.title}: ${number(row.rank)}`)
    .join("\n");
  return (
    <Popover
      withinPortal
      position="bottom-end"
      middlewares={{ flip: true, shift: { padding: 4 } }}
    >
      <Popover.Target>
        <Badge
          component="button"
          type="button"
          style={{ cursor: "pointer" }}
          data-srs-reader
          title={`${rows.length > 1 ? t("combined_rank_harmonic_mean") : ""}${details}`}
        >
          {number(rank)}
        </Badge>
      </Popover.Target>
      <Popover.Dropdown
        data-srs-reader
        maw="calc(100vw - 8px)"
        mah="calc(100dvh - 8px)"
        style={{ overflowY: "auto" }}
      >
        <Stack>
          {rows.map((row) => (
            <Group key={row.title} justify="space-between">
              <span title={row.title}>{row.title}</span>
              <strong>{number(row.rank)}</strong>
            </Group>
          ))}
          {rows.length > 1 && (
            <Text variant="supporting">
              {t("combined_using_the_harmonic_mean")}
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
