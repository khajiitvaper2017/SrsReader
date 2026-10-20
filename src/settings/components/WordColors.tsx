import {
  Accordion,
  Button,
  ColorInput,
  Group,
  NativeSelect,
  Stack,
  Switch,
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
    <Accordion>
      <Accordion.Item value="settings">
        <Accordion.Control>{t("word_colors")}</Accordion.Control>
        <Accordion.Panel>
          <Switch
            checked={settings.wordColorsEnabled}
            onChange={(event) =>
              onChange({ wordColorsEnabled: event.target.checked })
            }
            aria-label={t("color_words")}
            label={<strong>{t("color_words")}</strong>}
          />
          <Stack gap="xs">
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
                <Group key={state} gap="xs" align="center">
                  <span
                    style={{
                      color:
                        settings.wordColorsEnabled && style.mode === "text"
                          ? style.color
                          : undefined,
                      backgroundColor:
                        settings.wordColorsEnabled &&
                        style.mode === "background"
                          ? style.color + "30"
                          : undefined,
                    }}
                  >
                    {label}
                  </span>
                  <NativeSelect
                    aria-label={t("word_style", { label: label })}
                    disabled={!settings.wordColorsEnabled}
                    value={style.mode}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      return change({ mode: value as typeof style.mode });
                    }}
                  >
                    <option value="none">{t("off")}</option>
                    <option value="text">{t("text")}</option>
                    <option value="background">{t("background")}</option>
                  </NativeSelect>
                  <ColorInput
                    aria-label={t("word_color", { label: label })}
                    value={style.color}
                    disabled={
                      !settings.wordColorsEnabled || style.mode === "none"
                    }
                    onChange={(value) => change({ color: value })}
                  />
                </Group>
              );
            })}
          </Stack>
          <Button
            onClick={() => onChange({ wordStyles: defaults.wordStyles })}
            variant="subtle"
          >
            <RotateCcw aria-hidden="true" size={16} /> {t("reset_colors")}
          </Button>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
