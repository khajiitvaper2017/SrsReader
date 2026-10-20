import {
  Button,
  ColorInput,
  Grid,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { defaults, type Settings } from "@/settings/model";
import { wordStyleStates } from "@/settings/word-styles";
import { t } from "@/shared/i18n/i18n";
import { wordStateLabels } from "@/vocabulary/state";
import { RotateCcw } from "lucide-react";
export function WordColors({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <Paper>
      <Stack gap="md">
        <Title order={2}>{t("word_colors")}</Title>
        <Switch
          label={t("color_words")}
          checked={settings.wordColorsEnabled}
          onChange={(event) =>
            onChange({ wordColorsEnabled: event.target.checked })
          }
        />
        <Stack gap="sm">
          {wordStyleStates.map((state) => {
            const style = settings.wordStyles[state];
            const label = t(wordStateLabels[state]);
            const change = (patch: Partial<typeof style>) =>
              onChange({
                wordStyles: {
                  ...settings.wordStyles,
                  [state]: { ...style, ...patch },
                },
              });
            return (
              <Grid key={state} align="center" gap="xs">
                <Grid.Col span={{ base: 12, xs: 4 }}>
                  <Text
                    size="sm"
                    c={
                      settings.wordColorsEnabled && style.mode === "text"
                        ? style.color
                        : undefined
                    }
                    bg={
                      settings.wordColorsEnabled && style.mode === "background"
                        ? style.color + "30"
                        : undefined
                    }
                  >
                    {label}
                  </Text>
                </Grid.Col>
                <Grid.Col span={{ base: 6, xs: 4 }}>
                  <Select
                    aria-label={t("word_style", { label })}
                    disabled={!settings.wordColorsEnabled}
                    value={style.mode}
                    onChange={(mode) =>
                      change({ mode: mode as typeof style.mode })
                    }
                    data={[
                      { value: "none", label: t("off") },
                      { value: "text", label: t("text") },
                      { value: "background", label: t("background") },
                    ]}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, xs: 4 }}>
                  <ColorInput
                    aria-label={t("word_color", { label })}
                    value={style.color}
                    disabled={
                      !settings.wordColorsEnabled || style.mode === "none"
                    }
                    onChange={(color) => change({ color })}
                  />
                </Grid.Col>
              </Grid>
            );
          })}
        </Stack>
        <Group>
          <Button
            leftSection={<RotateCcw size={16} />}
            onClick={() => onChange({ wordStyles: defaults.wordStyles })}
            variant="subtle"
          >
            {t("reset_colors")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
