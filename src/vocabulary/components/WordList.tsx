import {
  Badge,
  Group,
  NavLink,
  Pagination,
  Box,
  Stack,
  Text,
} from "@mantine/core";
import { shortDefinition } from "@/dictionaries/definitions";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { useWords } from "@/vocabulary/hooks/useWords";
import { stateOf, wordStateLabels } from "@/vocabulary/state";
export function WordList({
  settings,
  controller,
}: {
  settings: Settings;
  controller: ReturnType<typeof useWords>;
}) {
  const { selected, setSelected, pageWords, page, pages, setPage } = controller;
  return (
    <Stack>
      <Box>
        {pageWords.map((w) => (
          <NavLink
            component="button"
            key={w.id}
            data-word-id={w.id}
            active={selected === w.id}
            label={w.lemma}
            lang={w.language}
            description={
              <Text variant="supporting" truncate="end">
                {shortDefinition(w).slice(0, 140) ||
                  t("open_to_see_definitions")}
              </Text>
            }
            rightSection={
              <Badge color="gray">
                {t(wordStateLabels[stateOf(w, settings.matureIntervalDays)])}
              </Badge>
            }
            onClick={() => {
              setSelected(w.id);
            }}
          />
        ))}
      </Box>
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
