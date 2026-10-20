import { LookupControls } from "@/reader/LookupControls";
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
    <section className="settings-section" id="controls">
      <div className="section-heading">
        <h2>{t("lookup_controls")}</h2>
      </div>
      <LookupControls
        value={settings.lookupBindings}
        onChange={(lookupBindings) => void update({ lookupBindings })}
      />
      <details className="input-prevention">
        <summary>{t("input_action_prevention")}</summary>
        <p className="muted">
          {t("active_only_for_matching_mouse_lookup_bindings_block")}{" "}
        </p>
        <div className="prevention-groups">
          {(
            [
              ["preventMiddleMouse", t("middle_mouse_button")],
              ["preventBackForward", t("back_forward_mouse_buttons")],
            ] as const
          ).map(([key, label]) => (
            <fieldset
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
            >
              <legend>{label}</legend>
              {(
                [
                  ["textHover", t("text_hover")],
                  ["webpages", t("webpages")],
                  ["popups", t("lookup_popups")],
                  ["extensionPages", t("extension_pages")],
                  ["searchFields", t("search_fields")],
                ] as const
              ).map(([scope, name]) => (
                <label key={scope}>
                  <input
                    type="checkbox"
                    checked={settings[key][scope]}
                    onChange={(event) =>
                      void update({
                        [key]: {
                          ...settings[key],
                          [scope]: event.target.checked,
                        },
                      })
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </details>
    </section>
  );
}
