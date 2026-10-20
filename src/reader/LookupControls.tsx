import {
  bindingKey,
  bindingLabel,
  lookupPresets,
  type LookupBinding,
} from "@/reader/controls";
import { t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";
import { Keyboard, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

export function LookupControls({
  value,
  onChange,
}: {
  value: LookupBinding[];
  onChange: (bindings: LookupBinding[]) => void;
}) {
  const [type, setType] = useState<"mouse" | "key" | "hover">("mouse");
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const finish = (binding: LookupBinding) => {
      if (!value.some((b) => bindingKey(b) === bindingKey(binding)))
        onChange([...value, binding]);
      setRecording(false);
    };
    const mods = (event: KeyboardEvent | MouseEvent) => ({
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    });
    let pending: LookupBinding | undefined;
    const key = (event: KeyboardEvent) => {
      stop(event);
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      if (event.repeat || type === "mouse") return;
      const modifierOnly = ["Control", "Alt", "Shift", "Meta"].includes(
        event.key,
      );
      if (modifierOnly) {
        if (type === "hover") pending = { type, code: "", ...mods(event) };
        return;
      }
      finish({ type, code: event.code, ...mods(event) });
    };
    const keyUp = (event: KeyboardEvent) => {
      stop(event);
      if (pending) finish(pending);
    };
    const mouseDown = (event: MouseEvent) => {
      if ((event.target as Element).closest("[data-binding-cancel]")) return;
      stop(event);
    };
    const mouseUp = (event: MouseEvent) => {
      if ((event.target as Element).closest("[data-binding-cancel]")) return;
      stop(event);
      if (type !== "mouse" || event.button > 4) return;
      if (event.button === 0)
        document.addEventListener("click", stop, { capture: true, once: true });
      finish({ type, button: event.button, ...mods(event) });
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("keyup", keyUp, true);
    document.addEventListener("mousedown", mouseDown, true);
    document.addEventListener("mouseup", mouseUp, true);
    document.addEventListener("auxclick", stop, true);
    document.addEventListener("contextmenu", stop, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("keyup", keyUp, true);
      document.removeEventListener("mousedown", mouseDown, true);
      document.removeEventListener("mouseup", mouseUp, true);
      document.removeEventListener("auxclick", stop, true);
      document.removeEventListener("contextmenu", stop, true);
    };
  }, [recording, type, value, onChange]);
  const custom = value.filter(
    (binding) =>
      !lookupPresets.some(
        (preset) => bindingKey(preset) === bindingKey(binding),
      ),
  );
  return (
    <div className="lookup-controls">
      <div className="binding-presets">
        {lookupPresets.map((binding) => {
          const key = bindingKey(binding);
          const selected = value.some((b) => bindingKey(b) === key);
          return (
            <label key={key}>
              <input
                type="checkbox"
                checked={selected}
                onChange={() =>
                  onChange(
                    selected
                      ? value.filter((b) => bindingKey(b) !== key)
                      : [...value, binding],
                  )
                }
              />
              {bindingLabel(binding)}
            </label>
          );
        })}
      </div>
      {custom.map((binding) => (
        <div className="binding-row" key={bindingKey(binding)}>
          <span>{bindingLabel(binding)}</span>
          <button
            className="quiet icon-button"
            title={t("remove_2", { value1: bindingLabel(binding) })}
            aria-label={t("remove_2", { value1: bindingLabel(binding) })}
            onClick={() =>
              onChange(
                value.filter((b) => bindingKey(b) !== bindingKey(binding)),
              )
            }
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="binding-recorder">
        <Select
          aria-label={t("custom_binding_type")}
          value={type}
          disabled={recording}
          onValueChange={(value) => setType(value as typeof type)}
        >
          <SelectOption value="mouse">{t("mouse_button")}</SelectOption>
          <SelectOption value="key">{t("keyboard_shortcut")}</SelectOption>
          <SelectOption value="hover">{t("hold_key_hover")}</SelectOption>
        </Select>
        <button disabled={recording} onClick={() => setRecording(true)}>
          <Keyboard aria-hidden="true" /> {t("record_binding")}
        </button>
        {recording && (
          <button
            title={t("cancel")}
            aria-label={t("cancel")}
            className="quiet icon-button"
            data-binding-cancel
            onClick={() => setRecording(false)}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {recording && (
        <p role="status" className="binding-status">
          {type === "mouse"
            ? t("press_a_mouse_button")
            : t("press_a_key_or_key_combination")}{" "}
          {t("escape_cancels")}{" "}
        </p>
      )}
    </div>
  );
}
