import {
  Button,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { DictionaryTags } from "@/dictionaries/components/DictionaryTags";
import type { Dictionary } from "@/dictionaries/model";
import { WordColors } from "@/settings/components/WordColors";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
export function ReadingSettings({
  settings,
  onChange: update,
  dictionaries,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  dictionaries: Dictionary[];
}) {
  return (
    <Paper mb="md">
      <Stack gap="md">
        <Title order={2}>{t("reading_appearance")}</Title>
        <Switch
          checked={!settings.paused}
          onChange={(event) => void update({ paused: !event.target.checked })}
          aria-label={t("parse_websites_automatically")}
          label={
            <span>
              <strong>{t("parse_websites_automatically")}</strong>
            </span>
          }
        />
        <Switch
          checked={settings.detectPageLanguage}
          onChange={(event) =>
            void update({ detectPageLanguage: event.target.checked })
          }
          aria-label={t("only_parse_the_reading_language")}
          label={
            <span>
              <strong>{t("only_parse_the_reading_language")}</strong>
              <Text component="small" size="xs" c="dimmed" display="block">
                {t("skips_text_detected_as_another_language")}
              </Text>
            </span>
          }
        />
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("appearance")}</strong>
          </span>
          <NativeSelect
            value={settings.theme}
            onChange={(event) => {
              const value = event.currentTarget.value;
              return void update({
                theme: value as Settings["theme"],
              });
            }}
            aria-label={t("appearance")}
            w={160}
            maw="50%"
          >
            <option value="system">{t("system")}</option>
            <option value="light">{t("light")}</option>
            <option value="dark">{t("dark")}</option>
          </NativeSelect>
        </Group>
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("popup_position")}</strong>
            <Text component="small" size="xs" c="dimmed" display="block">
              {t("popup_position_help")}
            </Text>
          </span>
          <NativeSelect
            value={settings.popupPlacement}
            onChange={(event) => {
              const value = event.currentTarget.value;
              return void update({
                popupPlacement: value as Settings["popupPlacement"],
              });
            }}
            aria-label={t("popup_position")}
            w={160}
            maw="50%"
          >
            <option value="auto">{t("automatic")}</option>
            <option value="below">{t("popup_position_below")}</option>
            <option value="beside">{t("popup_position_beside")}</option>
          </NativeSelect>
        </Group>
        <Switch
          checked={settings.hideDictionarySources}
          onChange={(event) =>
            void update({ hideDictionarySources: event.target.checked })
          }
          aria-label={t("hide_dictionary_source_links")}
          label={
            <span>
              <strong>{t("hide_dictionary_source_links")}</strong>
              <Text component="small" size="xs" c="dimmed" display="block">
                {t("in_lookup_popups")}
              </Text>
            </span>
          }
        />
        <Switch
          checked={settings.firstDictionaryOnly}
          onChange={(event) =>
            void update({ firstDictionaryOnly: event.target.checked })
          }
          aria-label={t("show_first_dictionary_only")}
          label={<strong>{t("show_first_dictionary_only")}</strong>}
        />
        {!!settings.disabledHosts.length && (
          <Stack gap="xs">
            <strong>{t("disabled_websites")}</strong>
            {settings.disabledHosts.map((host) => (
              <Group key={host} gap="xs" align="center" justify="space-between">
                <span>{host}</span>
                <Button
                  onClick={() =>
                    void update({
                      disabledHosts: settings.disabledHosts.filter(
                        (h) => h !== host,
                      ),
                    })
                  }
                  variant="subtle"
                >
                  {t("enable")}{" "}
                </Button>
              </Group>
            ))}
          </Stack>
        )}
        <Switch
          checked={settings.scanPopups}
          onChange={(event) =>
            void update({ scanPopups: event.target.checked })
          }
          aria-label={t("scan_dictionary_popups")}
          label={<strong>{t("scan_dictionary_popups")}</strong>}
        />
        <DictionaryTags
          dictionaries={dictionaries}
          settings={settings}
          onChange={(patch) => void update(patch)}
        />
        <WordColors
          settings={settings}
          onChange={(patch) => void update(patch)}
        />
        <Stack gap="xs" c="dimmed" fz="xs">
          {t("disable_individual_sites_from_the_toolbar")}{" "}
        </Stack>
      </Stack>
    </Paper>
  );
}
