import {
  Accordion,
  ActionIcon,
  Anchor,
  Button,
  Group,
  Flex,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Meanings } from "@/dictionaries/components/Meanings";
import { definitionText } from "@/dictionaries/definitions";
import { useDictionarySearch } from "@/dictionaries/hooks/useDictionarySearch";
import { languageLabel } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Search } from "lucide-react";
import { useState } from "react";

export function SearchPage({ settings }: { settings: Settings }) {
  const controller = useDictionarySearch();
  const { dictionaries, ready, result, busy, error } = controller;
  const [language, setLanguage] = useState(settings.studyLanguage);
  const [mode, setMode] = useState<"word" | "definition">("word");
  const [query, setQuery] = useState("");
  const available = dictionaries.some((d) => d.language === language);
  return (
    <Stack>
      <PageHeader title={t("dictionary_search")} />
      <ErrorBox error={error} />
      <Stack
        component="form"
        gap="xs"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim() && available && !busy)
            controller.search({ query: query.trim(), language, mode });
        }}
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          gap="xs"
          align="flex-end"
        >
          <Group
            wrap="nowrap"
            gap="xs"
            flex={1}
            w={{ base: "100%", md: "auto" }}
            miw={0}
          >
            <TextInput
              flex={1}
              miw={0}
              type="search"
              aria-label={t("dictionary_search_query")}
              placeholder={t("search")}
              required
              maxLength={500}
              disabled={busy}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                controller.clear();
              }}
            />
            <ActionIcon
              type="submit"
              variant="filled"
              color="accent"
              aria-label={t("dictionary_search_action")}
              title={t("dictionary_search_action")}
              loading={busy}
              disabled={!ready || !available || !query.trim()}
            >
              <Search aria-hidden size={20} />
            </ActionIcon>
          </Group>
          <SimpleGrid
            cols={2}
            spacing="xs"
            flex={1}
            w={{ base: "100%", md: "auto" }}
          >
            <Select
              aria-label={t("language")}
              searchable
              disabled={!ready || busy}
              value={language}
              data={[
                ...new Set([language, ...dictionaries.map((d) => d.language)]),
              ].map((value) => ({ value, label: languageLabel(value) }))}
              onChange={(value) => {
                if (value) {
                  setLanguage(value);
                  controller.clear();
                }
              }}
            />
            <Select
              aria-label={t("dictionary_search_by")}
              disabled={busy}
              value={mode}
              data={[
                { value: "word", label: t("dictionary_search_word") },
                {
                  value: "definition",
                  label: t("dictionary_search_definition"),
                },
              ]}
              onChange={(value) => {
                if (value === "word" || value === "definition") {
                  setMode(value);
                  controller.clear();
                }
              }}
            />
          </SimpleGrid>
        </Flex>
        {ready && !available && (
          <Text variant="supporting">
            {t("dictionary_search_no_dictionaries")}{" "}
            <Anchor href="#settings/dictionaries">{t("dictionaries")}</Anchor>
          </Text>
        )}
      </Stack>
      <Stack aria-live="polite" aria-busy={busy}>
        {result && (
          <Text variant="supporting">
            {result.entries.length
              ? t("dictionary_search_count", { count: result.entries.length })
              : t("dictionary_search_no_matches")}
          </Text>
        )}
        {!!result?.entries.length && (
          <Accordion order={2} multiple keepMounted={false}>
            {result.entries.map((entry) => (
              <Accordion.Item key={entry.id} value={entry.id}>
                <Accordion.Control
                  aria-label={`${entry.key} · ${entry.meaning.title}`}
                >
                  <Group gap="xs" justify="space-between">
                    <Text fw={600}>{entry.key}</Text>
                    <Text variant="supporting">
                      {entry.reading && entry.reading !== entry.key
                        ? `${entry.reading} · `
                        : ""}
                      {entry.meaning.title}
                    </Text>
                  </Group>
                  <Text variant="supporting" lineClamp={2}>
                    {definitionText(entry.meaning.definitions)}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Meanings
                    meanings={[entry.meaning]}
                    language={language}
                    settings={settings}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
        {result?.hasMore && (
          <Group justify="center">
            <Button onClick={controller.more} loading={busy}>
              {t("dictionary_search_more")}
            </Button>
          </Group>
        )}
      </Stack>
    </Stack>
  );
}
