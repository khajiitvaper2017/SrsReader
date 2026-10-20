import { DictionaryTags } from "@/dictionaries/DictionaryTags";
import type { Dictionary } from "@/dictionaries/model";
import { WordColors } from "@/settings/WordColors";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";

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
    <section className="settings-section">
      <div className="section-heading">
        <div>
          <h2>{t("reading_appearance")}</h2>
        </div>
      </div>
      <label className="setting-row">
        <span>
          <strong>{t("parse_websites_automatically")}</strong>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={!settings.paused}
          onChange={(event) => void update({ paused: !event.target.checked })}
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("only_parse_the_reading_language")}</strong>
          <small>{t("skips_text_detected_as_another_language")}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.detectPageLanguage}
          onChange={(event) =>
            void update({ detectPageLanguage: event.target.checked })
          }
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("appearance")}</strong>
        </span>
        <Select
          value={settings.theme}
          onValueChange={(value) =>
            void update({
              theme: value as Settings["theme"],
            })
          }
        >
          <SelectOption value="system">{t("system")}</SelectOption>
          <SelectOption value="light">{t("light")}</SelectOption>
          <SelectOption value="dark">{t("dark")}</SelectOption>
        </Select>
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("popup_position")}</strong>
          <small>{t("popup_position_help")}</small>
        </span>
        <Select
          value={settings.popupPlacement}
          onValueChange={(value) =>
            void update({
              popupPlacement: value as Settings["popupPlacement"],
            })
          }
        >
          <SelectOption value="auto">{t("automatic")}</SelectOption>
          <SelectOption value="below">{t("popup_position_below")}</SelectOption>
          <SelectOption value="beside">
            {t("popup_position_beside")}
          </SelectOption>
        </Select>
      </label>
      <label className="setting-row">
        <span>
          <strong>{t("hide_dictionary_source_links")}</strong>
          <small>{t("in_lookup_popups")}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.hideDictionarySources}
          onChange={(event) =>
            void update({ hideDictionarySources: event.target.checked })
          }
        />
      </label>
      <label className="setting-row">
        <strong>{t("show_first_dictionary_only")}</strong>
        <input
          type="checkbox"
          role="switch"
          checked={settings.firstDictionaryOnly}
          onChange={(event) =>
            void update({ firstDictionaryOnly: event.target.checked })
          }
        />
      </label>
      {!!settings.disabledHosts.length && (
        <div className="setting-stack">
          <strong>{t("disabled_websites")}</strong>
          {settings.disabledHosts.map((host) => (
            <div className="row between" key={host}>
              <span>{host}</span>
              <button
                className="link"
                onClick={() =>
                  void update({
                    disabledHosts: settings.disabledHosts.filter(
                      (h) => h !== host,
                    ),
                  })
                }
              >
                {t("enable")}{" "}
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="setting-row">
        <strong>{t("scan_dictionary_popups")}</strong>
        <input
          type="checkbox"
          role="switch"
          checked={settings.scanPopups}
          onChange={(event) =>
            void update({ scanPopups: event.target.checked })
          }
        />
      </label>
      <DictionaryTags
        dictionaries={dictionaries}
        settings={settings}
        onChange={(patch) => void update(patch)}
      />
      <WordColors
        settings={settings}
        onChange={(patch) => void update(patch)}
      />
      <div className="setting-footnote">
        {t("disable_individual_sites_from_the_toolbar")}{" "}
      </div>
    </section>
  );
}
