import { ActionIcon, TextInput } from "@mantine/core";
import { bindingLabel, type LookupBinding } from "@/reader/controls";
import { t } from "@/shared/i18n/i18n";
import { X } from "lucide-react";
import { useRef, useState } from "react";

/** Captures a shortcut, or a held-key hover binding. Null clears the binding. */
export function BindingInput({
  label,
  value,
  onChange,
  hover = false,
  error,
}: {
  label: string;
  value: LookupBinding | null;
  onChange: (binding: LookupBinding | null) => void;
  hover?: boolean;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<LookupBinding | null>(null);
  const [recording, setRecording] = useState(false);
  const finish = (binding: LookupBinding) => {
    onChange(binding);
    input.current?.blur();
  };
  const modifiers = (event: React.KeyboardEvent | React.MouseEvent) => ({
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  });
  const stop = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <TextInput
      ref={input}
      data-binding-input
      label={label}
      error={error}
      readOnly
      value={recording ? "" : value ? bindingLabel(value) : ""}
      placeholder={t(
        recording ? "binding_press_input" : "binding_capture_input",
      )}
      onFocus={() => setRecording(true)}
      onBlur={() => {
        setRecording(false);
        pending.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          input.current?.blur();
          return;
        }
        if (event.repeat || event.nativeEvent.isComposing) return;
        if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
          if (hover)
            pending.current = { type: "hover", code: "", ...modifiers(event) };
          return;
        }
        if (event.code)
          finish({
            type: hover ? "hover" : "key",
            code: event.code,
            ...modifiers(event),
          });
      }}
      onKeyUp={(event) => {
        if (!pending.current) return;
        event.preventDefault();
        event.stopPropagation();
        finish(pending.current);
      }}
      onMouseDown={(event) => {
        if (!recording || hover || event.button > 4) return;
        stop(event);
        finish({ type: "mouse", button: event.button, ...modifiers(event) });
      }}
      onMouseUp={stop}
      onAuxClick={stop}
      onContextMenu={stop}
      rightSectionPointerEvents="all"
      rightSection={
        value && (
          <ActionIcon
            variant="subtle"
            aria-label={t("remove_2", { value1: bindingLabel(value) })}
            onClick={() => onChange(null)}
          >
            <X aria-hidden="true" size={16} />
          </ActionIcon>
        )
      }
    />
  );
}
