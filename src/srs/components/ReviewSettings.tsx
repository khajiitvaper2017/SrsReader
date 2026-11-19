import {
  Accordion,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import type { Dictionary } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { SrsSettings } from "@/srs/components/SrsSettings";
import { srsPreferencesSchema } from "@/srs/preferences";
import { TimedReviewSettings } from "@/srs/components/TimedReviewSettings";
export function ReviewSettings({
  settings,
  onChange: update,
  dictionaries,
  onError,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  dictionaries: Dictionary[];
  onError: (message: string) => void;
}) {
  return (
    <Stack>
      <Stack>
        <Title order={2}>{t("settings_review_session")}</Title>
        <Select
          label={t("default_card_front")}
          value={settings.front}
          onChange={(front) =>
            void update({
              front: front as Settings["front"],
            })
          }
          data={[
            { value: "word", label: t("word_only") },
            { value: "sentence", label: t("word_in_sentence") },
          ]}
        />
        <Switch
          labelPosition="left"
          w="100%"
          styles={{
            body: { width: "100%", minHeight: 44, alignItems: "center" },
            labelWrapper: { flex: 1 },
            track: { flexShrink: 0 },
          }}
          label={t("show_part_of_speech_on_card_fronts")}
          checked={settings.showPartOfSpeech}
          onChange={(event) =>
            void update({ showPartOfSpeech: event.target.checked })
          }
        />
        <Switch
          labelPosition="left"
          w="100%"
          styles={{
            body: { width: "100%", minHeight: 44, alignItems: "center" },
            labelWrapper: { flex: 1 },
            track: { flexShrink: 0 },
          }}
          label={t("show_gendered_article")}
          description={t("show_gendered_article_help")}
          checked={settings.showGenderedArticle}
          onChange={(event) =>
            void update({ showGenderedArticle: event.currentTarget.checked })
          }
        />
        <Switch
          labelPosition="left"
          w="100%"
          styles={{
            body: { width: "100%", minHeight: 44, alignItems: "center" },
            labelWrapper: { flex: 1 },
            track: { flexShrink: 0 },
          }}
          label={t("show_sentence_translations")}
          checked={settings.showSentenceTranslation}
          onChange={(event) =>
            void update({ showSentenceTranslation: event.target.checked })
          }
        />
        <Switch
          labelPosition="left"
          w="100%"
          styles={{
            body: { width: "100%", minHeight: 44, alignItems: "center" },
            labelWrapper: { flex: 1 },
            track: { flexShrink: 0 },
          }}
          label={t("use_only_again_and_good")}
          checked={settings.onlyAgainGood}
          onChange={(event) =>
            void update({ onlyAgainGood: event.target.checked })
          }
        />
      </Stack>

      <TimedReviewSettings settings={settings} onChange={update} />
      <Switch
        label={t("auto_bury_failed")}
        description={t("auto_bury_failed_help")}
        checked={settings.autoBuryFailed}
        onChange={(event) =>
          void update({ autoBuryFailed: event.currentTarget.checked })
        }
      />

      <Stack>
        <Title order={2}>{t("settings_daily_study")}</Title>
        <Text variant="supporting">{t("study_overview_help")}</Text>
        <Switch
          label={t("delay_mined_cards")}
          description={t("delay_mined_cards_help")}
          checked={settings.delayMinedCards}
          onChange={(event) =>
            void update({ delayMinedCards: event.currentTarget.checked })
          }
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <NumberInput
            label={t("new_words_per_day")}
            description={t("does_not_limit_reviews_while_reading")}
            min={0}
            max={10000}
            value={settings.newLimit}
            onChange={(value) => {
              if (value !== "") void update({ newLimit: Number(value) });
            }}
          />
          <Select
            label={t("words_without_frequency")}
            value={settings.missingFrequency}
            disabled={settings.newGatherOrder !== "frequency"}
            onChange={(value) =>
              void update({
                missingFrequency: value as Settings["missingFrequency"],
              })
            }
            data={[
              { value: "last", label: t("introduce_last") },
              { value: "random", label: t("assign_random_frequency") },
            ]}
          />
        </SimpleGrid>
      </Stack>

      <Accordion keepMounted keepMountedMode="display-none">
        <Accordion.Item value="display-order">
          <Accordion.Control>{t("srs_display_order")}</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {(
                  [
                    ["newGatherOrder", "srs_new_gather_order"],
                    ["newSortOrder", "srs_new_sort_order"],
                    ["newReviewOrder", "srs_new_review_order"],
                    ["interdayReviewOrder", "srs_interday_review_order"],
                    ["reviewSortOrder", "srs_review_sort_order"],
                  ] as const
                ).map(([key, label]) => (
                  <Select
                    key={key}
                    label={t(label)}
                    value={settings[key]}
                    allowDeselect={false}
                    maxDropdownHeight="calc(100dvh - 16px)"
                    data={srsPreferencesSchema.shape[key]
                      .unwrap()
                      .options.map((value) => ({
                        value,
                        label: t(`srs_order_${value}`),
                      }))}
                    onChange={(value) => {
                      if (value) void update({ [key]: value });
                    }}
                  />
                ))}
              </SimpleGrid>
              <Text variant="supporting">{t("srs_display_order_help")}</Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Stack>
        <Title order={2}>{t("settings_scheduling")}</Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <NumberInput
            label={t("desired_retention")}
            description={t("70_99_higher_values_mean_more_reviews")}
            min={70}
            max={99}
            value={Math.round(settings.retention * 100)}
            suffix="%"
            onChange={(value) => {
              if (value !== "") void update({ retention: Number(value) / 100 });
            }}
          />
          <NumberInput
            label={t("mature_interval_days")}
            description={t("mature_interval_help")}
            min={1}
            step={1}
            value={settings.matureIntervalDays}
            onChange={(value) => {
              if (value !== "")
                void update({ matureIntervalDays: Number(value) });
            }}
          />
        </SimpleGrid>
        <SrsSettings
          settings={settings}
          dictionaries={dictionaries}
          onChange={update}
          onError={onError}
        />
      </Stack>
    </Stack>
  );
}
