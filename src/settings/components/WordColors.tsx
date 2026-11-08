import {
  Button,
  ColorInput,
  Grid,
  Group,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { defaults, type Settings } from "@/settings/model";
import { wordTintColor } from "@/reader/highlight-style";
import { wordStyleStates } from "@/settings/word-styles";
import { t } from "@/shared/i18n/i18n";
import { wordStateLabels } from "@/vocabulary/state";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
export function WordColors({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const [opacity, setOpacity] = useState(settings.wordColorOpacity);
  useEffect(
    () => setOpacity(settings.wordColorOpacity),
    [settings.wordColorOpacity],
  );
  return (
    <Paper>
      <Stack>
        <Title order={2}>{t("word_colors")}</Title>
        <Switch
          label={t("color_words")}
          checked={settings.wordColorsEnabled}
          onChange={(event) =>
            onChange({ wordColorsEnabled: event.target.checked })
          }
        />
        <Stack gap="xs">
          <Group justify="space-between">
            <Text>{t("word_tint_opacity")}</Text>
            <Text variant="supporting">{opacity}%</Text>
          </Group>
          <Slider
            value={opacity}
            onChange={setOpacity}
            onChangeEnd={(value) => onChange({ wordColorOpacity: value })}
            min={0}
            max={100}
            label={(value) => `${value}%`}
            thumbLabel={t("word_tint_opacity")}
            thumbValueText={(value) => `${value}%`}
            disabled={!settings.wordColorsEnabled}
          />
          <Text variant="supporting">{t("word_tint_help")}</Text>
        </Stack>
        <Stack>
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
              <Grid key={state} align="center">
                <Grid.Col span={{ base: 12, xs: 4 }}>
                  <Text
                    component="span"
                    bg={
                      settings.wordColorsEnabled && style.mode === "background"
                        ? wordTintColor(style.color, opacity)
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
                      { value: "background", label: t("word_tint") },
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
            onClick={() =>
              onChange({
                wordStyles: defaults.wordStyles,
                wordColorOpacity: defaults.wordColorOpacity,
              })
            }
            variant="subtle"
          >
            {t("reset_colors")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
