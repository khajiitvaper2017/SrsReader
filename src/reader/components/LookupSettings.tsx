import {
  Accordion,
  Checkbox,
  Fieldset,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { LookupControls } from "@/reader/components/LookupControls";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
export function LookupSettings({
  settings,
  onChange: update,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  return (
    <Paper id="controls">
      <Stack>
        <Title order={2}>{t("lookup_controls")}</Title>
        <LookupControls
          value={settings.lookupBindings}
          onChange={(lookupBindings) => void update({ lookupBindings })}
        />
        <Accordion>
          <Accordion.Item value="settings">
            <Accordion.Control>
              {t("input_action_prevention")}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack>
                <Text variant="supporting">
                  {t(
                    "active_only_for_matching_mouse_lookup_bindings_block",
                  )}{" "}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {(
                    [
                      ["preventMiddleMouse", t("middle_mouse_button")],
                      ["preventBackForward", t("back_forward_mouse_buttons")],
                    ] as const
                  ).map(([key, label]) => (
                    <Fieldset
                      key={key}
                      disabled={
                        !settings.lookupBindings.some(
                          (binding) =>
                            binding.type === "mouse" &&
                            (key === "preventMiddleMouse"
                              ? binding.button === 1
                              : binding.button === 3 || binding.button === 4),
                        )
                      }
                      legend={label}
                    >
                      <Stack>
                        {(
                          [
                            ["textHover", t("text_hover")],
                            ["webpages", t("webpages")],
                            ["popups", t("lookup_popups")],
                            ["extensionPages", t("extension_pages")],
                            ["searchFields", t("search_fields")],
                          ] as const
                        ).map(([scope, name]) => (
                          <Checkbox
                            checked={settings[key][scope]}
                            onChange={(event) =>
                              void update({
                                [key]: {
                                  ...settings[key],
                                  [scope]: event.target.checked,
                                },
                              })
                            }
                            aria-label={name}
                            label={name}
                            key={scope}
                          />
                        ))}
                      </Stack>
                    </Fieldset>
                  ))}
                </SimpleGrid>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Paper>
  );
}
