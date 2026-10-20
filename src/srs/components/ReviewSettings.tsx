import {
  Group,
  NativeSelect,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import type { Dictionary } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { SrsSettings } from "@/srs/components/SrsSettings";
export function ReviewSettings({
  settings,
  onChange: update,
  dictionaries,
  onError: setError,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  dictionaries: Dictionary[];
  onError: (message: string) => void;
}) {
  return (
    <Paper mb="md">
      <Stack gap="md">
        <Title order={2}>{t("spaced_repetition")}</Title>

        <Switch
          checked={settings.onlyAgainGood}
          onChange={(event) =>
            void update({ onlyAgainGood: event.target.checked })
          }
          aria-label={t("use_only_again_and_good")}
          label={
            <span>
              <strong>{t("use_only_again_and_good")}</strong>
            </span>
          }
        />
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("new_words_per_day")}</strong>
            <Text component="small" size="xs" c="dimmed" display="block">
              {t("does_not_limit_reviews_while_reading")}
            </Text>
          </span>
          <NumberInput
            min={0}
            max={10000}
            value={settings.newLimit}
            onChange={(value) => {
              if (value !== "") void update({ newLimit: Number(value) });
            }}
            aria-label={t("new_words_per_day")}
            w={160}
            maw="50%"
          />
        </Group>
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("words_without_frequency")}</strong>
          </span>
          <NativeSelect
            value={settings.missingFrequency}
            onChange={(event) => {
              const value = event.currentTarget.value;
              return void update({
                missingFrequency: value as Settings["missingFrequency"],
              });
            }}
            aria-label={t("words_without_frequency")}
            w={160}
            maw="50%"
          >
            <option value="last">{t("introduce_last")}</option>
            <option value="random">{t("assign_random_frequency")}</option>
          </NativeSelect>
        </Group>
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("mature_interval_days")}</strong>
            <Text component="small" size="xs" c="dimmed" display="block">
              {t("mature_interval_help")}
            </Text>
          </span>
          <NumberInput
            min={1}
            step={1}
            value={settings.matureIntervalDays}
            onChange={(value) => {
              if (value !== "")
                void update({
                  matureIntervalDays: Number(value),
                });
            }}
            aria-label={t("mature_interval_days")}
            w={160}
            maw="50%"
          />
        </Group>
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("desired_retention")}</strong>
            <Text component="small" size="xs" c="dimmed" display="block">
              {t("70_99_higher_values_mean_more_reviews")}
            </Text>
          </span>
          <NumberInput
            min={70}
            max={99}
            value={Math.round(settings.retention * 100)}
            onChange={(value) => {
              if (value !== "")
                void update({
                  retention: Number(value) / 100,
                });
            }}
            suffix="%"
            aria-label={t("desired_retention")}
            w={160}
            maw="50%"
          />
        </Group>
        <Switch
          checked={settings.showSentenceTranslation}
          onChange={(event) =>
            void update({
              showSentenceTranslation: event.target.checked,
            })
          }
          aria-label={t("show_sentence_translations")}
          label={<strong>{t("show_sentence_translations")}</strong>}
        />
        <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("default_card_front")}</strong>
          </span>
          <NativeSelect
            value={settings.front}
            onChange={(event) => {
              const value = event.currentTarget.value;
              return void update({
                front: value as Settings["front"],
              });
            }}
            aria-label={t("default_card_front")}
            w={160}
            maw="50%"
          >
            <option value="word">{t("word_only")}</option>
            <option value="sentence">{t("word_in_sentence")}</option>
          </NativeSelect>
        </Group>
        <SrsSettings
          settings={settings}
          dictionaries={dictionaries}
          onChange={update}
          onError={setError}
        />
        <Stack gap="xs" c="dimmed" fz="xs">
          {t("new_words_follow_combined_frequency_ranks_from_most")}{" "}
        </Stack>
      </Stack>
    </Paper>
  );
}
