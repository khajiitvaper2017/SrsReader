import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Loader,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Filter, Search } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { languageLabel, languageName } from "@/languages/codes";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { PageHeader } from "@/shared/ui/PageHeader";
import { WordDetails } from "@/vocabulary/components/WordDetails";
import { WordList } from "@/vocabulary/components/WordList";
import { useWords } from "@/vocabulary/hooks/useWords";
import { wordStateLabels, wordStates } from "@/vocabulary/state";
import { deckPathLabel } from "@/srs/deck-tree";

export function WordsPage({
  settings,
  language,
  deckId,
  selected,
}: {
  settings: Settings;
  language: string;
  deckId?: string;
  selected: string;
}) {
  const theme = useMantineTheme();
  const desktop = useMediaQuery(`(min-width: ${theme.breakpoints.md})`);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<{ id: string; scroll: number } | null>(null);
  function setSelected(id: string) {
    if (id === selected) return;
    const [route, query] = location.hash.slice(1).split("?");
    const params = new URLSearchParams(query);
    if (id) {
      returnTo.current = { id, scroll: window.scrollY };
      params.set("word", id);
      location.hash = `${route}?${params}`;
    } else {
      params.delete("word");
      location.replace(`#${route}${params.size ? `?${params}` : ""}`);
    }
  }
  const controller = useWords({
    settings,
    language,
    deckId,
    selected,
    setSelected,
  });
  const { query, setQuery, filter, setFilter, error, word, total } = controller;
  const { overview, decksReady, loading } = controller;
  const paneScroll = {
    type: "auto",
    scrollbars: desktop ? "y" : false,
    offsetScrollbars: desktop ? "y" : false,
    viewportProps: desktop ? { tabIndex: 0 } : undefined,
  } as const;
  useLayoutEffect(() => {
    if (desktop) {
      detailRef.current?.scrollTo(0, 0);
      return;
    }
    if (selected) {
      if (returnTo.current) returnTo.current.id = selected;
      window.scrollTo(0, 0);
      return;
    }
    const saved = returnTo.current;
    if (!saved) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, saved.scroll);
      listRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-word-id="${CSS.escape(saved.id)}"]`,
        )
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, desktop]);
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
    <Stack
      h={
        desktop
          ? "calc(100dvh - var(--app-shell-header-offset) - 2 * var(--mantine-spacing-md))"
          : undefined
      }
    >
      <PageHeader
        title={t("words")}
        back={
          !desktop && selected
            ? {
                label: t("close_word_details"),
                onClick: () => {
                  if (returnTo.current) history.back();
                  else {
                    setSelected("");
                    searchRef.current?.focus({ preventScroll: true });
                  }
                },
              }
            : undefined
        }
        actions={
          (desktop || !selected) && (total > 0 || !loading) ? (
            <Text variant="supporting">
              {t("words_result_count", { count: total })}
            </Text>
          ) : undefined
        }
      />
      <ErrorBox error={error} />
      <Box display={!desktop && selected ? "none" : undefined}>
        <Flex
          direction={{ base: "column", md: "row" }}
          gap="xs"
          align="flex-end"
        >
          <Group
            gap="xs"
            wrap="nowrap"
            w={{ base: "100%", md: "auto" }}
            flex={1}
            miw={0}
          >
            <TextInput
              ref={searchRef}
              flex={1}
              miw={0}
              type="search"
              aria-label={t("search_saved_words")}
              placeholder={t("search_words")}
              leftSection={<Search aria-hidden size={18} />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ActionIcon
              hiddenFrom="md"
              aria-label={t("filter_words")}
              aria-expanded={filtersOpen}
              aria-controls="word-filters"
              variant={filtersOpen || filter !== "all" ? "light" : "subtle"}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter aria-hidden size={20} />
            </ActionIcon>
          </Group>
          <Box
            id="word-filters"
            display={{ base: filtersOpen ? "block" : "none", md: "block" }}
            w={{ base: "100%", md: "auto" }}
            flex={{ md: 2 }}
          >
            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
              <Select
                aria-label={t("language")}
                searchable
                value={language}
                data={[
                  ...new Set([
                    language,
                    ...overview.map((row) => row.language),
                  ]),
                ].map((value) => ({ value, label: languageLabel(value) }))}
                onChange={(value) => {
                  if (value) location.hash = `words/${value}`;
                }}
              />
              <Select
                aria-label={t("words_deck")}
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
              <Select
                aria-label={t("filter_words")}
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
          </Box>
        </Flex>
        {!desktop && !filtersOpen && decksReady && (
          <Text variant="supporting" mt="xs">
            {t("words_scope", {
              language: languageName(language),
              deck: deckName,
            })}
          </Text>
        )}
      </Box>
      <Flex gap="md" flex={1} mih={0} direction={{ base: "column", md: "row" }}>
        <ScrollArea
          {...paneScroll}
          ref={listRef}
          display={!desktop && selected ? "none" : undefined}
          flex={selected ? 5 : 1}
          miw={0}
          mih={0}
        >
          {!loading && !error && !total ? (
            <Empty title={t("no_words_found")}>
              {t(
                query || filter !== "all"
                  ? "words_no_matching_filters"
                  : "words_empty_deck",
              )}
            </Empty>
          ) : (
            <WordList settings={settings} controller={controller} />
          )}
        </ScrollArea>
        {selected && (
          <ScrollArea
            {...paneScroll}
            viewportRef={detailRef}
            flex={7}
            miw={0}
            mih={0}
          >
            {word ? (
              <WordDetails
                key={word.id}
                settings={settings}
                controller={controller}
              />
            ) : (
              !error && <Loader aria-label={t("loading")} />
            )}
          </ScrollArea>
        )}
      </Flex>
    </Stack>
  );
}
