import {
  Grid,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { languageLabel, languageName } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { WordDetails } from "@/vocabulary/components/WordDetails";
import { WordList } from "@/vocabulary/components/WordList";
import { useWords } from "@/vocabulary/hooks/useWords";
import { wordStateLabels, wordStates } from "@/vocabulary/state";
import { deckPathLabel } from "@/srs/deck-tree";
export function WordsPage({
  settings,
  language,
  deckId,
}: {
  settings: Settings;
  language: string;
  deckId?: string;
}) {
  const controller = useWords({ settings, language, deckId });
  const { query, setQuery, filter, setFilter, error, word, total } = controller;
  const { overview, decksReady, loading } = controller;
  const row = overview.find((row) => row.language === language);
  const deckName = !deckId
    ? t("words_all_decks")
    : deckId === "mined"
      ? t("study_mined_words")
      : deckPathLabel(
          row?.decks.find((deck) => deck.id === deckId)?.name ||
            t("study_deck_not_found"),
        );
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={1}>{t("words")}</Title>
        {(total > 0 || !loading) && (
          <Text variant="supporting">
            {t("words_result_count", { count: total })}
          </Text>
        )}
      </Group>
      <ErrorBox error={error} />
      <Paper>
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label={t("language")}
              searchable
              value={language}
              data={[
                ...new Set([language, ...overview.map((row) => row.language)]),
              ].map((value) => ({ value, label: languageLabel(value) }))}
              onChange={(value) => {
                if (value) location.hash = `words/${value}`;
              }}
            />
            <Select
              label={t("words_deck")}
              searchable
              value={deckId || "all"}
              data={[
                { value: "all", label: t("words_all_decks") },
                { value: "mined", label: t("study_mined_words") },
                ...(row?.decks.map((deck) => ({
                  value: deck.id,
                  label: deckPathLabel(deck.name),
                })) || []),
              ]}
              onChange={(value) => {
                if (value)
                  location.hash = `words/${language}${value === "all" ? "" : `/${encodeURIComponent(value)}`}`;
              }}
            />
            <TextInput
              type="search"
              label={t("search_saved_words")}
              placeholder={t("search_words")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              label={t("filter_words")}
              value={filter}
              onChange={(value) => {
                if (value) setFilter(value);
              }}
              data={[
                { value: "all", label: t("all_words") },
                { value: "leeches", label: t("srs_leeches") },
                ...wordStates
                  .filter((state) => state !== "unknown")
                  .map((state) => ({
                    value: state,
                    label: t(wordStateLabels[state]),
                  })),
              ]}
            />
          </SimpleGrid>
          {decksReady && (
            <Text variant="supporting">
              {t("words_scope", {
                language: languageName(language),
                deck: deckName,
              })}
            </Text>
          )}
        </Stack>
      </Paper>
      {!loading && !error && !total ? (
        <Paper>
          <Empty title={t("no_words_found")}>
            {t(
              query || filter !== "all"
                ? "words_no_matching_filters"
                : "words_empty_deck",
            )}
          </Empty>
        </Paper>
      ) : (
        total > 0 && (
          <Grid align="start">
            <Grid.Col span={{ base: 12, md: word ? 5 : 12 }}>
              <WordList settings={settings} controller={controller} />
            </Grid.Col>
            {word && (
              <Grid.Col span={{ base: 12, md: 7 }}>
                <WordDetails settings={settings} controller={controller} />
              </Grid.Col>
            )}
          </Grid>
        )
      )}
    </Stack>
  );
}
