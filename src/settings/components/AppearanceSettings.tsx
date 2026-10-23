import {
  ColorInput,
  Paper,
  SegmentedControl,
  Stack,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useState } from "react";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";

export function AppearanceSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  const theme = useMantineTheme();
  const narrow = useMediaQuery(`(max-width: ${theme.breakpoints.xs})`);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  useEffect(() => setAccentColor(settings.accentColor), [settings.accentColor]);
  return (
    <Paper>
      <Stack>
        <Title order={2}>{t("appearance")}</Title>
        <SegmentedControl
          w="100%"
          maw={480}
          fullWidth
          orientation={narrow ? "vertical" : "horizontal"}
          value={settings.theme}
          onChange={(theme) =>
            void onChange({ theme: theme as Settings["theme"] })
          }
          aria-label={t("appearance")}
          data={[
            { value: "system", label: t("system") },
            { value: "light", label: t("light") },
            { value: "dark", label: t("dark") },
            { value: "oled", label: t("oled") },
          ]}
        />
        <ColorInput
          label={t("accent_color")}
          description={t("accent_color_help")}
          maw={480}
          value={accentColor}
          onChange={setAccentColor}
          onChangeEnd={(accentColor) => void onChange({ accentColor })}
          disallowInput={false}
        />
      </Stack>
    </Paper>
  );
}
