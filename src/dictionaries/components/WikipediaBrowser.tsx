import {
  Accordion,
  ActionIcon,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import catalog from "@/dictionaries/catalogs/wikipedia-catalog.json";
import { languageLabel, languageName } from "@/languages/codes";
import { downloadSize, t } from "@/shared/i18n/i18n";
import { Download } from "lucide-react";
import { useState } from "react";

export type WikipediaDownload = (typeof catalog)[number];
export const wikipediaDownloadUrl = (file: string) =>
  `https://github.com/MarvNC/wikipedia-yomitan/releases/download/v1.6.1/${encodeURIComponent(file)}`;

export function WikipediaBrowser({
  language,
  busy,
  onImport,
}: {
  language: string;
  busy: boolean;
  onImport: (entry: WikipediaDownload) => Promise<void>;
}) {
  const [installing, setInstalling] = useState(false);
  const entry = catalog.find((entry) => entry.code === language);
  async function install(entry: WikipediaDownload) {
    setInstalling(true);
    try {
      await onImport(entry);
    } finally {
      setInstalling(false);
    }
  }
  return (
    <Accordion keepMounted={false}>
      <Accordion.Item value="catalogue">
        <Accordion.Control>{t("wikipedia_dictionaries")}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Text variant="supporting">{t("wikipedia_dictionaries_help")}</Text>
            {entry ? (
              <Paper withBorder p="sm">
                <Group align="center" wrap="nowrap">
                  <Stack gap={0} miw={0} flex={1}>
                    <strong>{languageLabel(entry.code)}</strong>
                    <Text variant="supporting">
                      {t("wikipedia_article_summaries")} ·{" "}
                      {downloadSize(entry.size)}
                    </Text>
                  </Stack>
                  <ActionIcon
                    disabled={busy}
                    onClick={() => void install(entry)}
                    title={t("import_dictionary_named", {
                      title: `${t("corpus_wikipedia")} · ${languageName(entry.code)}`,
                    })}
                    aria-label={t("import_dictionary_named", {
                      title: `${t("corpus_wikipedia")} · ${languageName(entry.code)}`,
                    })}
                    variant="default"
                  >
                    {installing ? (
                      <Loader size={14} aria-hidden="true" />
                    ) : (
                      <Download aria-hidden="true" size={16} />
                    )}
                  </ActionIcon>
                </Group>
              </Paper>
            ) : (
              <Text>{t("no_matching_dictionaries")}</Text>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
