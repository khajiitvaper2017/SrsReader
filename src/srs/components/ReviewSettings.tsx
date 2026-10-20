import type { Dictionary } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";
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
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>{t("spaced_repetition")}</h2>
        </div>
      </div>
      <SrsSettings
        settings={settings}
        dictionaries={dictionaries}
        onChange={update}
        onError={setError}
      />
      <label className="setting-row">
        <span>
          <strong>{t("use_only_again_and_good")}</strong>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.onlyAgainGood}
          onChange={(event) =>
            void update({ onlyAgainGood: event.target.checked })
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("new_words_per_day")}</strong>
          <small>{t("does_not_limit_reviews_while_reading")}</small>
        </span>
        <input
          type="number"
          min={0}
          max={10000}
          value={settings.newLimit}
          onChange={(event) => {
            if (event.target.value !== "")
              void update({ newLimit: Number(event.target.value) });
          }}
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("words_without_frequency")}</strong>
        </span>
        <Select
          value={settings.missingFrequency}
          onValueChange={(value) =>
            void update({
              missingFrequency: value as Settings["missingFrequency"],
            })
          }
        >
          <SelectOption value="last">{t("introduce_last")}</SelectOption>
          <SelectOption value="random">
            {t("assign_random_frequency")}
          </SelectOption>
        </Select>
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("mature_interval_days")}</strong>
          <small>{t("mature_interval_help")}</small>
        </span>
        <div className="input-suffix">
          <input
            type="number"
            min={1}
            step={1}
            value={settings.matureIntervalDays}
            onChange={(event) => {
              if (event.target.value !== "")
                void update({
                  matureIntervalDays: Number(event.target.value),
                });
            }}
          />
        </div>
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("desired_retention")}</strong>
          <small>{t("70_99_higher_values_mean_more_reviews")}</small>
        </span>
        <div className="input-suffix">
          <input
            type="number"
            min={70}
            max={99}
            value={Math.round(settings.retention * 100)}
            onChange={(event) => {
              if (event.target.value !== "")
                void update({
                  retention: Number(event.target.value) / 100,
                });
            }}
          />
          <span>%</span>
        </div>
      </label>
      <label className="setting-row">
        <strong>{t("show_sentence_translations")}</strong>
        <input
          type="checkbox"
          role="switch"
          checked={settings.showSentenceTranslation}
          onChange={(event) =>
            void update({
              showSentenceTranslation: event.target.checked,
            })
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("default_card_front")}</strong>
        </span>
        <Select
          value={settings.front}
          onValueChange={(value) =>
            void update({
              front: value as Settings["front"],
            })
          }
        >
          <SelectOption value="word">{t("word_only")}</SelectOption>
          <SelectOption value="sentence">{t("word_in_sentence")}</SelectOption>
        </Select>
      </label>
      <div className="setting-footnote">
        {t("new_words_follow_combined_frequency_ranks_from_most")}{" "}
      </div>
    </section>
  );
}
