import {
  NumberInput,
  Paper,
  SegmentedControl,
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
      <Paper>
        <Stack>
          <Title order={2}>{t("settings_review_session")}</Title>
          <Stack>
            <Text fw={500} id="card-front-label">
              {t("default_card_front")}
            </Text>
            <SegmentedControl
              w="100%"
              maw={480}
              fullWidth
              aria-labelledby="card-front-label"
              value={settings.front}
              onChange={(front) =>
                void update({ front: front as Settings["front"] })
              }
              data={[
                { value: "word", label: t("word_only") },
                { value: "sentence", label: t("word_in_sentence") },
              ]}
            />
          </Stack>
          <Switch
            label={t("show_sentence_translations")}
            checked={settings.showSentenceTranslation}
            onChange={(event) =>
              void update({ showSentenceTranslation: event.target.checked })
            }
          />
          <Switch
            label={t("use_only_again_and_good")}
            checked={settings.onlyAgainGood}
            onChange={(event) =>
              void update({ onlyAgainGood: event.target.checked })
            }
          />
        </Stack>
      </Paper>
      <Paper>
        <Stack>
          <Title order={2}>{t("settings_daily_study")}</Title>
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
          {settings.newGatherOrder === "frequency" && (
            <Text variant="supporting">
              {t("new_words_follow_combined_frequency_ranks_from_most")}
            </Text>
          )}
        </Stack>
      </Paper>
      <Paper>
        <Stack>
          <Title order={2}>{t("srs_display_order")}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {(
              [
                [
                  "newGatherOrder",
                  "srs_new_gather_order",
                  "srs_new_gather_help",
                ],
                ["newSortOrder", "srs_new_sort_order", "srs_new_sort_help"],
                [
                  "newReviewOrder",
                  "srs_new_review_order",
                  "srs_new_review_help",
                ],
                [
                  "interdayReviewOrder",
                  "srs_interday_review_order",
                  "srs_interday_review_help",
                ],
                [
                  "reviewSortOrder",
                  "srs_review_sort_order",
                  "srs_review_sort_help",
                ],
              ] as const
            ).map(([key, label, help]) => (
              <Select
                key={key}
                label={t(label)}
                description={t(help)}
                value={settings[key]}
                allowDeselect={false}
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
      </Paper>
      <Paper>
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
                if (value !== "")
                  void update({ retention: Number(value) / 100 });
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
      </Paper>
    </Stack>
  );
}
