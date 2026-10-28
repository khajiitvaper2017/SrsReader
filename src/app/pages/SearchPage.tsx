import {
  Accordion,
  Anchor,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Meanings } from "@/dictionaries/components/Meanings";
import { definitionText } from "@/dictionaries/definitions";
import { useDictionarySearch } from "@/dictionaries/hooks/useDictionarySearch";
import { languageLabel } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
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
      <Title order={1}>{t("dictionary_search")}</Title>
      <ErrorBox error={error} />
      <Paper
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim() && available && !busy)
            controller.search({ query: query.trim(), language, mode });
        }}
      >
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label={t("language")}
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
              label={t("dictionary_search_by")}
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
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              flex={1}
              miw={0}
              type="search"
              label={t("dictionary_search_query")}
              required
              maxLength={500}
              disabled={busy}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                controller.clear();
              }}
            />
            <Button
              type="submit"
              leftSection={<Search size={16} />}
              loading={busy}
              disabled={!ready || !available || !query.trim()}
            >
              {t("dictionary_search_action")}
            </Button>
          </Group>
          <Text variant="supporting">{t("dictionary_search_help")}</Text>
          {ready && !available && (
            <Text variant="supporting">
              {t("dictionary_search_no_dictionaries")}{" "}
              <Anchor href="#settings/dictionaries">{t("dictionaries")}</Anchor>
            </Text>
          )}
        </Stack>
      </Paper>
      {!ready && <Loader />}
      <Stack aria-live="polite" aria-busy={busy}>
        {result && (
          <Text variant="supporting">
            {result.entries.length
              ? t("dictionary_search_count", { count: result.entries.length })
              : t("dictionary_search_no_matches")}
          </Text>
        )}
        {!!result?.entries.length && (
          <Paper>
            <Accordion order={2} multiple keepMounted={false}>
              {result.entries.map((entry) => (
                <Accordion.Item key={entry.id} value={entry.id}>
                  <Accordion.Control
                    aria-label={`${entry.key} · ${entry.meaning.title}`}
                  >
                    <Text fw={600}>
                      {entry.key}
                      {entry.reading && entry.reading !== entry.key
                        ? ` · ${entry.reading}`
                        : ""}
                    </Text>
                    <Text variant="supporting">{entry.meaning.title}</Text>
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
          </Paper>
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
