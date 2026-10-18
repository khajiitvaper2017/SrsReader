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
      <summary>Word colors</summary>
      <label className="setting-row">
        <strong>Color words</strong>
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
          const label = wordStateLabels[state];
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
                aria-label={`${label} word style`}
                disabled={!settings.wordColorsEnabled}
                value={style.mode}
                onChange={(event) =>
                  change({ mode: event.target.value as typeof style.mode })
                }
              >
                <option value="none">Off</option>
                <option value="text">Text</option>
                <option value="background">Background</option>
              </select>
              <input
                type="color"
                aria-label={`${label} word color`}
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
        Reset colors
      </button>
    </details>
  );
}
