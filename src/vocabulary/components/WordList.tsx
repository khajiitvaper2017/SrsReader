import {
  Badge,
  Divider,
  Group,
  NavLink,
  Pagination,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { Fragment } from "react";
import { shortDefinition } from "@/dictionaries/definitions";
import type { Settings } from "@/settings/model";
import { i18n, t } from "@/shared/i18n/i18n";
import type { useWords } from "@/vocabulary/hooks/useWords";
import { stateOf, wordStateLabels, type WordState } from "@/vocabulary/state";

const statusColors: Record<WordState, string> = {
  unknown: "red",
  new: "orange",
  learning: "yellow",
  review: "teal",
  due: "violet",
  known: "green",
  suspended: "gray",
};

export function WordList({
  settings,
  controller,
}: {
  settings: Settings;
  controller: ReturnType<typeof useWords>;
}) {
  const { selected, setSelected, pageWords, page, pages, setPage } = controller;
  const currentYear = new Date().getFullYear();
  return (
    <Stack>
      {pageWords.length > 0 && (
        <Paper withBorder p={0}>
          {pageWords.map((word, index) => {
            const state = stateOf(word, settings.matureIntervalDays);
            const next = word.known
              ? undefined
              : word.linkedCards
                  .flatMap(({ schedule, suspended }) =>
                    !suspended && schedule && schedule.state !== 0
                      ? [schedule]
                      : [],
                  )
                  .sort((a, b) => a.dueAt - b.dueAt)[0];
            const date = next && new Date(next.dueAt);
            return (
              <Fragment key={word.id}>
                {index > 0 && <Divider />}
                <NavLink
                  component="button"
                  type="button"
                  data-word-id={word.id}
                  active={selected === word.id}
                  aria-current={selected === word.id ? "true" : undefined}
                  px="sm"
                  py="xs"
                  styles={{
                    body: { minWidth: 0, overflowWrap: "anywhere" },
                    section: { maxWidth: "46%", minWidth: 0 },
                  }}
                  label={
                    <Group component="span" gap="xs" style={{ rowGap: 0 }}>
                      <Text component="span" fw={600} lang={word.language}>
                        {word.lemma}
                      </Text>
                      {word.reading && word.reading !== word.lemma && (
                        <Text
                          component="span"
                          variant="supporting"
                          lang={word.language}
                        >
                          {word.reading}
                        </Text>
                      )}
                      {next && date && (
                        <Text
                          component="time"
                          dateTime={date.toISOString()}
                          variant="supporting"
                        >
                          {t("words_review_date", {
                            date: date.toLocaleString(i18n.resolvedLanguage, {
                              month: "short",
                              day: "numeric",
                              year:
                                date.getFullYear() === currentYear
                                  ? undefined
                                  : "numeric",
                              ...(next.state === 2 || next.interday
                                ? {}
                                : { hour: "numeric", minute: "2-digit" }),
                            }),
                          })}
                        </Text>
                      )}
                    </Group>
                  }
                  description={
                    <Text
                      component="span"
                      variant="supporting"
                      lineClamp={2}
                      maw="76ch"
                    >
                      {shortDefinition(word) || t("open_to_see_definitions")}
                    </Text>
                  }
                  rightSection={
                    <Group component="span" gap={4} justify="flex-end">
                      {word.leech && (
                        <Badge color="red">{t("srs_leech")}</Badge>
                      )}
                      <Badge color={statusColors[state]}>
                        {t(wordStateLabels[state])}
                      </Badge>
                    </Group>
                  }
                  onClick={() => setSelected(word.id)}
                />
              </Fragment>
            );
          })}
        </Paper>
      )}
      {pages > 1 && (
        <Group justify="center">
          <Pagination
            role="navigation"
            total={pages}
            value={page}
            onChange={(value) => {
              setPage(value);
              setSelected("");
            }}
            aria-label={t("words_pages")}
            getControlProps={(control) => ({
              "aria-label": t(`pagination_${control}`),
            })}
            getItemProps={(value) => ({
              "aria-label": t("words_page", { page: value }),
              "aria-current": page === value ? "page" : undefined,
            })}
          />
        </Group>
      )}
    </Stack>
  );
}
