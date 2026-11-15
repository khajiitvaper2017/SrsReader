import { ColorInput, SimpleGrid, Select, Stack, Title } from "@mantine/core";
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
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  useEffect(() => setAccentColor(settings.accentColor), [settings.accentColor]);
  return (
    <Stack>
      <Title order={2}>{t("appearance")}</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <Select
          value={settings.theme}
          onChange={(theme) =>
            void onChange({
              theme: theme as Settings["theme"],
            })
          }
          label={t("appearance")}
          data={[
            { value: "system", label: t("system") },
            { value: "light", label: t("light") },
            { value: "dark", label: t("dark") },
            { value: "oled", label: t("oled") },
          ]}
        />
        <ColorInput
          label={t("accent_color")}
          value={accentColor}
          onChange={setAccentColor}
          onChangeEnd={(accentColor) => void onChange({ accentColor })}
          disallowInput={false}
        />
      </SimpleGrid>
    </Stack>
  );
}
