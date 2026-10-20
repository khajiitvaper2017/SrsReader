import { Badge, NavLink, Paper } from "@mantine/core";
import { shortDefinition } from "@/dictionaries/definitions";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { useWords } from "@/vocabulary/hooks/useWords";
import { stateOf } from "@/vocabulary/model";
import { wordStateLabels } from "@/vocabulary/state";
export function WordList({
  settings,
  controller,
}: {
  settings: Settings;
  controller: ReturnType<typeof useWords>;
}) {
  const { selected, setSelected, setEditing, visible } = controller;
  return (
    <Paper p={0}>
      {visible.map((w) => (
        <NavLink
          component="button"
          key={w.id}
          active={selected === w.id}
          label={w.lemma}
          lang={w.language}
          description={
            shortDefinition(w).slice(0, 140) || t("open_to_see_definitions")
          }
          rightSection={
            <Badge color="gray">
              {t(wordStateLabels[stateOf(w, settings.matureIntervalDays)])}
            </Badge>
          }
          onClick={() => {
            setSelected(w.id);
            setEditing(false);
          }}
          styles={{
            label: { fontWeight: 600 },
            description: { whiteSpace: "normal", overflowWrap: "anywhere" },
          }}
        />
      ))}
    </Paper>
  );
}
