import { t } from "./i18n";
import { defaults, type Settings } from "./model";
import { wordStyleStates, wordStateLabels } from "./word-styles";

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
              <select
                aria-label={t("word_style", { label: label })}
                disabled={!settings.wordColorsEnabled}
                value={style.mode}
                onChange={(event) =>
                  change({ mode: event.target.value as typeof style.mode })
                }
              >
                <option value="none">{t("off")}</option>
                <option value="text">{t("text")}</option>
                <option value="background">{t("background")}</option>
              </select>
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
        {t("reset_colors")}{" "}
      </button>
    </details>
  );
}
