import {
  Loader,
  Accordion,
  ActionIcon,
  Group,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import catalogData from "@/dictionaries/catalogs/wiktionary-catalog.json";
import { languageCode, languageLabel, languageName } from "@/languages/codes";
import { downloadSize, i18n, t } from "@/shared/i18n/i18n";
import { Download } from "lucide-react";
import { useState } from "react";
import { SourceAttribution } from "@/shared/ui/SourceAttribution";
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
  nativeLanguages,
  busy,
  onImport,
}: {
  language: string;
  nativeLanguages: string[];
  busy: boolean;
  onImport: (entry: WiktionaryDownload) => Promise<void>;
}) {
  const defaultLanguages = [language, ...nativeLanguages];
  const [target, setTarget] = useState(
    downloads.some(
      (entry) =>
        (!language || languageCode(entry.source) === language) &&
        defaultLanguages.includes(languageCode(entry.target)),
    )
      ? "native"
      : "",
  );
  const [type, setType] = useState("");
  const [sort, setSort] = useState("language");
  const [search, setSearch] = useState("");
  const [installing, setInstalling] = useState("");
  const available = downloads.filter(
    (entry) =>
      languageCode(entry.source) === language &&
      languageName(languageCode(entry.source)) !== languageCode(entry.source) &&
      languageName(languageCode(entry.target)) !== languageCode(entry.target),
  );
  const targets = [
    ...new Set(available.map((entry) => languageCode(entry.target))),
  ];
  const matching = available.filter(
    (entry) =>
      !target ||
      (target === "native"
        ? defaultLanguages.includes(languageCode(entry.target))
        : languageCode(entry.target) === target),
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
    <Accordion keepMounted={false}>
      <Accordion.Item value="catalogue">
        <Accordion.Control>{t("wiktionary_dictionaries")}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <SourceAttribution
              i18nKey="wiktionary_acknowledgement"
              links={{
                wiktionary: "https://www.wiktionary.org/",
                kaikki: "https://kaikki.org/",
                converter: "https://yomidevs.github.io/wiktionary-to-yomitan/",
                license: "https://en.wiktionary.org/wiki/Wiktionary:Copyrights",
              }}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label={t("definition_language")}
                aria-label={t("definition_language")}
                value={target}
                onChange={(value) => {
                  setTarget(value!);
                  setType("");
                }}
                data={[
                  { value: "", label: t("all_languages") },
                  {
                    value: "native",
                    label: t("native_languages_and_language", {
                      language: languageName(language),
                    }),
                  },
                  ...targets.sort(compareLanguages).map((code) => ({
                    value: code,
                    label: languageLabel(code),
                  })),
                ]}
              />
              <Select
                label={t("type")}
                aria-label={t("dictionary_type")}
                value={type}
                onChange={(value) => setType(value!)}
                data={[
                  { value: "", label: t("all_types") },
                  ...types
                    .filter((type) =>
                      matching.some((entry) => entry.type === type),
                    )
                    .map((type) => ({
                      value: type,
                      label: t(typeLabels[type]),
                    })),
                ]}
              />
              <Select
                label={t("sort_by")}
                aria-label={t("sort_dictionaries")}
                value={sort}
                onChange={(value) => setSort(value!)}
                data={[
                  { value: "language", label: t("language") },
                  { value: "size", label: t("download_size") },
                ]}
              />
              <TextInput
                type="search"
                label={t("search_dictionaries")}
                aria-label={t("search_dictionaries")}
                placeholder={t("search_languages")}
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
                aria-label={t("available_wiktionary_dictionaries")}
              >
                {entries.map((entry) => (
                  <Paper key={wiktionaryName(entry)} withBorder p="sm">
                    <Group align="center" wrap="nowrap">
                      <Stack gap={0} miw={0} flex={1}>
                        <strong>
                          {languageLabel(languageCode(entry.source))} →{" "}
                          {languageLabel(languageCode(entry.target))}
                        </strong>
                        <Text variant="supporting">
                          {t(typeLabels[entry.type])} ·{" "}
                          {downloadSize(entry.size)} · {wiktionaryName(entry)}
                        </Text>
                      </Stack>
                      <ActionIcon
                        disabled={busy}
                        onClick={() => void install(entry)}
                        title={t("import_dictionary_named", {
                          title: wiktionaryName(entry),
                        })}
                        aria-label={t("import_dictionary_named", {
                          title: wiktionaryName(entry),
                        })}
                        variant="default"
                      >
                        {installing === wiktionaryName(entry) ? (
                          <Loader size={14} aria-hidden="true" />
                        ) : (
                          <Download aria-hidden="true" size={16} />
                        )}
                      </ActionIcon>
                    </Group>
                  </Paper>
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
