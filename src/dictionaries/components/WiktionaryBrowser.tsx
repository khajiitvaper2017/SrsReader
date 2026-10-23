import {
  Loader,
  Accordion,
  ActionIcon,
  Group,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import catalogData from "@/dictionaries/catalogs/wiktionary-catalog.json";
import { languageCode, languageName } from "@/languages/codes";
import { downloadSize, i18n, t } from "@/shared/i18n/i18n";
import { Download } from "lucide-react";
import { useState } from "react";
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
    <Accordion
      value={open ? "catalogue" : null}
      onChange={(value) => setOpen(value !== null)}
    >
      <Accordion.Item value="catalogue">
        <Accordion.Control>{t("wiktionary_dictionaries")}</Accordion.Control>
        <Accordion.Panel>
          {open && (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Group justify="space-between" align="center" wrap="nowrap">
                  {t("study_language")}
                  <NativeSelect
                    aria-label={t("dictionary_study_language")}
                    value={source}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSource(value);
                      setTarget("");
                      setType("");
                    }}
                    w={160}
                    maw="50%"
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
                  </NativeSelect>
                </Group>
                <Group justify="space-between" align="center" wrap="nowrap">
                  {t("definition_language")}
                  <NativeSelect
                    aria-label={t("definition_language")}
                    value={target}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setTarget(value);
                      setType("");
                    }}
                    w={160}
                    maw="50%"
                  >
                    <option value="">{t("all_languages")}</option>
                    {targets.sort(compareLanguages).map((code) => (
                      <option key={code} value={code}>
                        {languageName(code)}
                      </option>
                    ))}
                  </NativeSelect>
                </Group>
                <Group justify="space-between" align="center" wrap="nowrap">
                  {t("type")}
                  <NativeSelect
                    aria-label={t("dictionary_type")}
                    value={type}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      return setType(value);
                    }}
                    w={160}
                    maw="50%"
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
                  </NativeSelect>
                </Group>
                <Group justify="space-between" align="center" wrap="nowrap">
                  {t("sort_by")}
                  <NativeSelect
                    aria-label={t("sort_dictionaries")}
                    value={sort}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      return setSort(value);
                    }}
                    w={160}
                    maw="50%"
                  >
                    <option value="language">{t("language")}</option>
                    <option value="size">{t("download_size")}</option>
                  </NativeSelect>
                </Group>
                <TextInput
                  type="search"
                  aria-label={t("search_dictionaries")}
                  placeholder={t("search_languages")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </SimpleGrid>
              <Stack
                aria-label={t("available_wiktionary_dictionaries")}
                mah={280}
                style={{ overflowY: "auto" }}
              >
                {entries.map((entry) => (
                  <Group key={wiktionaryName(entry)} align="center">
                    <Stack>
                      <strong>
                        {languageName(languageCode(entry.source))} →{" "}
                        {languageName(languageCode(entry.target))}
                      </strong>
                      <Text variant="supporting">
                        {t(typeLabels[entry.type])} · {downloadSize(entry.size)}{" "}
                        · {wiktionaryName(entry)}
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
                ))}
                {!entries.length && (
                  <Text>{t("no_matching_dictionaries")}</Text>
                )}
              </Stack>
            </>
          )}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
