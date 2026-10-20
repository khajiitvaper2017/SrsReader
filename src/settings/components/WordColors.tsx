import { defaults, type Settings } from "@/settings/model";
import { wordStyleStates } from "@/settings/word-styles";
import { t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";
import { wordStateLabels } from "@/vocabulary/state";
import { RotateCcw } from "lucide-react";

export function WordColors({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <details className="word-colors">
      <summary>{t("word_colors")}</summary>
      <label className="setting-row">
        <strong>{t("color_words")}</strong>
        <input
          type="checkbox"
          role="switch"
          checked={settings.wordColorsEnabled}
          onChange={(event) =>
            onChange({ wordColorsEnabled: event.target.checked })
          }
        />
      </label>
      <div className="word-color-options">
        {wordStyleStates.map((state) => {
          const style = settings.wordStyles[state];
          const label = t(wordStateLabels[state]);
          const change = (patch: Partial<typeof style>) =>
            onChange({
              wordStyles: {
                ...settings.wordStyles,
                [state]: { ...style, ...patch },
              },
            });
          return (
            <div className="word-color-row" key={state}>
              <span
                style={{
                  color:
                    settings.wordColorsEnabled && style.mode === "text"
                      ? style.color
                      : undefined,
                  backgroundColor:
                    settings.wordColorsEnabled && style.mode === "background"
                      ? style.color + "30"
                      : undefined,
                }}
              >
                {label}
              </span>
              <Select
                aria-label={t("word_style", { label: label })}
                disabled={!settings.wordColorsEnabled}
                value={style.mode}
                onValueChange={(value) =>
                  change({ mode: value as typeof style.mode })
                }
              >
                <SelectOption value="none">{t("off")}</SelectOption>
                <SelectOption value="text">{t("text")}</SelectOption>
                <SelectOption value="background">
                  {t("background")}
                </SelectOption>
              </Select>
              <input
                type="color"
                aria-label={t("word_color", { label: label })}
                value={style.color}
                disabled={!settings.wordColorsEnabled || style.mode === "none"}
                onChange={(event) => change({ color: event.target.value })}
              />
            </div>
          );
        })}
      </div>
      <button
        className="quiet"
        onClick={() => onChange({ wordStyles: defaults.wordStyles })}
      >
        <RotateCcw aria-hidden="true" /> {t("reset_colors")}
      </button>
    </details>
  );
}
