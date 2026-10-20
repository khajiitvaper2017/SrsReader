import {
  Grid,
  Group,
  NativeSelect,
  Paper,
  Text,
  TextInput,
} from "@mantine/core";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { WordDetails } from "@/vocabulary/components/WordDetails";
import { WordList } from "@/vocabulary/components/WordList";
import { useWords } from "@/vocabulary/hooks/useWords";
import { wordStateLabels, wordStates } from "@/vocabulary/state";
export function WordsPage({ settings }: { settings: Settings }) {
  const controller = useWords({ settings });
  const { query, setQuery, filter, setFilter, error, word, visible } =
    controller;
  return (
    <>
      <ErrorBox error={error} />
      <Group gap="xs" align="center" mb="md" wrap="nowrap">
        <TextInput
          style={{ flex: 1, minWidth: 160 }}
          type="search"
          aria-label={t("search_saved_words")}
          placeholder={t("search_words")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          w={160}
          maw="50%"
        />
        <NativeSelect
          aria-label={t("filter_words")}
          value={filter}
          onChange={(event) => {
            const value = event.currentTarget.value;
            return setFilter(value);
          }}
          style={{ flex: 1, minWidth: 0 }}
        >
          <option value="all">{t("all_words")}</option>
          <option value="leeches">{t("srs_leeches")}</option>
          {wordStates
            .filter((state) => state !== "unknown")
            .map((state) => (
              <option key={state} value={state}>
                {t(wordStateLabels[state])}
              </option>
            ))}
        </NativeSelect>
      </Group>
      {!visible.length ? (
        <Paper mb="md">
          <Empty title={t("no_words_found")}>
            <Text>
              {query || filter !== "all"
                ? ""
                : t("save_a_word_from_a_website_to_add")}
            </Text>
          </Empty>
        </Paper>
      ) : (
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
      )}
    </>
  );
}
