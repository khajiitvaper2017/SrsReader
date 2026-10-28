import {
  Button,
  Divider,
  Group,
  Paper,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { DictionaryTags } from "@/dictionaries/components/DictionaryTags";
import type { Dictionary } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { udpipePermission } from "@/languages/udpipe-permission";
import { udpipeModel, udpipeModels } from "@/languages/codes";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { useState } from "react";

export function ReadingSettings({
  settings,
  onChange: update,
  dictionaries,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  dictionaries: Dictionary[];
}) {
  const [parserError, setParserError] = useState("");
  const [parserBusy, setParserBusy] = useState(false);
  const models = udpipeModels(settings.studyLanguage);
  async function changeParser(enabled: boolean) {
    setParserBusy(true);
    setParserError("");
    try {
      if (enabled && !(await udpipePermission(true))) {
        setParserError(t("udpipe_permission_denied"));
        return;
      }
      await update({ udpipe: enabled });
    } catch (error) {
      setParserError((error as Error).message);
    } finally {
      setParserBusy(false);
    }
  }
  return (
    <>
      <Paper>
        <Stack>
          <Title order={2}>{t("settings_page_reading")}</Title>
          <Switch
            label={t("parse_websites_automatically")}
            description={t("parse_websites_automatically_help")}
            checked={!settings.paused}
            onChange={(event) =>
              void update({ paused: !event.currentTarget.checked })
            }
          />
          <Text variant="supporting">{t("studied_reading_help")}</Text>
          <Select
            label={t("word_loading")}
            description={t("word_loading_help")}
            value={settings.wordLoading[settings.studyLanguage] ?? "automatic"}
            allowDeselect={false}
            data={[
              { value: "automatic", label: t("automatic") },
              { value: "onLookup", label: t("word_loading_on_lookup") },
            ]}
            onChange={(value) =>
              void update({
                wordLoading: {
                  ...settings.wordLoading,
                  [settings.studyLanguage]: value as "automatic" | "onLookup",
                },
              })
            }
          />
          <Switch
            label={t("use_udpipe")}
            description={t("udpipe_help")}
            checked={settings.udpipe}
            disabled={
              !settings.studyLanguages.some((language) =>
                udpipeModel(language),
              ) || parserBusy
            }
            onChange={(event) => void changeParser(event.currentTarget.checked)}
          />
          <ErrorBox error={parserError} />
          {models.length > 1 && (
            <Radio.Group
              label={t("udpipe_model")}
              description={t("udpipe_model_help")}
              value={udpipeModel(
                settings.studyLanguage,
                settings.udpipeModels[settings.studyLanguage],
              )}
              onChange={(value) =>
                void update({
                  udpipeModels: {
                    ...settings.udpipeModels,
                    [settings.studyLanguage]: value,
                  },
                })
              }
            >
              <Stack mt="xs">
                {models.map((model, index) => {
                  const corpus = model.split("-ud-")[0]!;
                  const name = t(`udpipe_model_${corpus}`);
                  return (
                    <Radio
                      key={model}
                      value={model}
                      label={
                        index === 0 ? t("udpipe_model_default", { name }) : name
                      }
                      description={t(`udpipe_corpus_${corpus}`)}
                      disabled={!settings.udpipe || parserBusy}
                    />
                  );
                })}
              </Stack>
            </Radio.Group>
          )}
          <Switch
            label={t("automatically_ignore_proper_names")}
            description={t("ignore_proper_names_help")}
            checked={settings.ignoreProperNames}
            disabled={!udpipeModel(settings.studyLanguage) || !settings.udpipe}
            onChange={(event) =>
              void update({ ignoreProperNames: event.currentTarget.checked })
            }
          />
          {!!settings.disabledHosts.length && (
            <>
              <Divider />
              <Stack>
                <Text fw={500}>{t("disabled_websites")}</Text>
                {settings.disabledHosts.map((host) => (
                  <Group key={host} justify="space-between">
                    <Text style={{ minWidth: 0 }}>{host}</Text>
                    <Button
                      variant="subtle"
                      onClick={() =>
                        void update({
                          enabledHosts: [...settings.enabledHosts, host],
                          disabledHosts: settings.disabledHosts.filter(
                            (h) => h !== host,
                          ),
                        })
                      }
                    >
                      {t("enable")}
                    </Button>
                  </Group>
                ))}
              </Stack>
            </>
          )}
          <Text variant="supporting">
            {t("disable_individual_sites_from_the_toolbar")}
          </Text>
        </Stack>
      </Paper>
      <Paper>
        <Stack>
          <Title order={2}>{t("lookup_popups")}</Title>
          <Select
            label={t("popup_position")}
            description={t("popup_position_help")}
            value={settings.popupPlacement}
            onChange={(value) =>
              void update({
                popupPlacement: value as Settings["popupPlacement"],
              })
            }
            data={[
              { value: "auto", label: t("automatic") },
              { value: "below", label: t("popup_position_below") },
              { value: "beside", label: t("popup_position_beside") },
            ]}
          />
          <Switch
            label={t("scan_dictionary_popups")}
            checked={settings.scanPopups}
            onChange={(event) =>
              void update({ scanPopups: event.currentTarget.checked })
            }
          />
          <Switch
            label={t("hide_dictionary_source_links")}
            description={t("in_lookup_popups")}
            checked={settings.hideDictionarySources}
            onChange={(event) =>
              void update({
                hideDictionarySources: event.currentTarget.checked,
              })
            }
          />
          <DictionaryTags
            dictionaries={dictionaries}
            settings={settings}
            onChange={(patch) => void update(patch)}
          />
        </Stack>
      </Paper>
    </>
  );
}
