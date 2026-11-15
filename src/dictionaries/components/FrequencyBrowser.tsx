import {
  Loader,
  Accordion,
  ActionIcon,
  Group,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import catalog from "@/dictionaries/catalogs/frequency-catalog.json";
import {
  languageCode,
  languageLabel,
  languageName,
  supportedLanguages,
} from "@/languages/codes";
import { downloadSize, i18n, t } from "@/shared/i18n/i18n";
import { Download } from "lucide-react";
import { useState } from "react";
import { SourceAttribution } from "@/shared/ui/SourceAttribution";
export type FrequencyDownload = (typeof catalog)[number];
export const frequencyDownloadUrl = (file: string) =>
  `https://github.com/StefanVukovic99/leipzig-to-yomitan/releases/download/v2024-08-31-18-57-16-00-00/${encodeURIComponent(file)}`;
const downloads = catalog.filter((entry) =>
  supportedLanguages.includes(languageCode(entry.code)),
);
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
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("language");
  const [installing, setInstalling] = useState("");
  const available = downloads.filter(
    (entry) =>
      entry.code === language && languageName(entry.code) !== entry.code,
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
    <Accordion>
      <Accordion.Item value="settings">
        <Accordion.Control>{t("frequency_dictionaries")}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <SourceAttribution
              i18nKey="frequency_acknowledgement"
              links={{
                corpus: "https://wortschatz.uni-leipzig.de/",
                converter:
                  "https://github.com/StefanVukovic99/leipzig-to-yomitan",
                license: "https://wortschatz.uni-leipzig.de/en/download/",
              }}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label={t("type")}
                aria-label={t("corpus_type")}
                value={type}
                onChange={(value) => setType(value!)}
                data={[
                  { value: "", label: t("all_types") },
                  ...types.map((type) => ({
                    value: type,
                    label: t(typeLabels[type]!),
                  })),
                ]}
              />
              <Select
                label={t("sort_by")}
                aria-label={t("sort_frequency_dictionaries")}
                value={sort}
                onChange={(value) => setSort(value!)}
                data={[
                  { value: "language", label: t("language") },
                  { value: "type", label: t("type") },
                  { value: "size", label: t("download_size") },
                ]}
              />
              <TextInput
                type="search"
                label={t("search_frequency_dictionaries")}
                aria-label={t("search_frequency_dictionaries")}
                placeholder={t("search_corpora_or_regions")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </SimpleGrid>
            <ScrollArea.Autosize
              mah={280}
              scrollbars="y"
              offsetScrollbars
              type="auto"
            >
              <Stack
                gap="xs"
                aria-label={t("available_frequency_dictionaries")}
              >
                {entries.map((entry) => (
                  <Group key={entry.file} py="xs" align="center" wrap="nowrap">
                    <Stack gap={0} miw={0} flex={1}>
                      <strong>
                        {languageLabel(entry.code)} · {entry.source}
                      </strong>
                      <Text variant="supporting">
                        {entry.region && `${entry.region} · `}
                        {downloadSize(entry.size)}
                      </Text>
                    </Stack>
                    <ActionIcon
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
                      variant="default"
                    >
                      {installing === entry.file ? (
                        <Loader size={14} aria-hidden="true" />
                      ) : (
                        <Download aria-hidden="true" size={16} />
                      )}
                    </ActionIcon>
                  </Group>
                ))}
                {!entries.length && (
                  <Text>{t("no_matching_dictionaries")}</Text>
                )}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
