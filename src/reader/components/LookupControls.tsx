import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import {
  bindingKey,
  bindingLabel,
  lookupPresets,
  type LookupBinding,
} from "@/reader/controls";
import { t } from "@/shared/i18n/i18n";
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
    <Stack>
      <Group align="center">
        {lookupPresets.map((binding) => {
          const key = bindingKey(binding);
          const selected = value.some((b) => bindingKey(b) === key);
          return (
            <Checkbox
              checked={selected}
              onChange={() =>
                onChange(
                  selected
                    ? value.filter((b) => bindingKey(b) !== key)
                    : [...value, binding],
                )
              }
              aria-label={bindingLabel(binding)}
              label={bindingLabel(binding)}
              key={key}
            />
          );
        })}
      </Group>
      {custom.map((binding) => (
        <Group key={bindingKey(binding)} align="center">
          <span>{bindingLabel(binding)}</span>
          <ActionIcon
            title={t("remove_2", { value1: bindingLabel(binding) })}
            aria-label={t("remove_2", { value1: bindingLabel(binding) })}
            onClick={() =>
              onChange(
                value.filter((b) => bindingKey(b) !== bindingKey(binding)),
              )
            }
            variant="subtle"
          >
            <Trash2 aria-hidden="true" size={16} />
          </ActionIcon>
        </Group>
      ))}
      <Group align="center">
        <Select
          aria-label={t("custom_binding_type")}
          value={type}
          disabled={recording}
          w={{ base: "100%", xs: 240 }}
          onChange={(value) => setType(value as typeof type)}
          data={[
            { value: "mouse", label: t("mouse_button") },
            { value: "key", label: t("keyboard_shortcut") },
            { value: "hover", label: t("hold_key_hover") },
          ]}
        />
        <Button
          disabled={recording}
          onClick={() => setRecording(true)}
          variant="default"
        >
          <Keyboard aria-hidden="true" size={16} /> {t("record_binding")}
        </Button>
        {recording && (
          <ActionIcon
            title={t("cancel")}
            aria-label={t("cancel")}
            data-binding-cancel
            onClick={() => setRecording(false)}
            variant="subtle"
          >
            <X aria-hidden="true" size={16} />
          </ActionIcon>
        )}
      </Group>
      {recording && (
        <Text role="status">
          {type === "mouse"
            ? t("press_a_mouse_button")
            : t("press_a_key_or_key_combination")}{" "}
          {t("escape_cancels")}{" "}
        </Text>
      )}
    </Stack>
  );
}
