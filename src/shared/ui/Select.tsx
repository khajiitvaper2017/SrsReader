import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

export function Select({
  value,
  onValueChange,
  children,
  disabled,
  open,
  onOpenChange,
  iconOnly = false,
  "aria-label": label,
  title,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  iconOnly?: boolean;
  "aria-label"?: string;
  title?: string;
}) {
  return (
    <RadixSelect.Root
      value={`option:${value}`}
      onValueChange={(value) => onValueChange(value.slice("option:".length))}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
    >
      <RadixSelect.Trigger
        className={
          iconOnly ? "quiet icon-button word-select-trigger" : "app-select"
        }
        aria-label={label}
        title={title}
      >
        {!iconOnly && <RadixSelect.Value />}
        <RadixSelect.Icon>
          <ChevronDown aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          className="select-menu"
          position="popper"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <RadixSelect.ScrollUpButton className="select-scroll">
            <ChevronUp aria-hidden="true" />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport>{children}</RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="select-scroll">
            <ChevronDown aria-hidden="true" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export function SelectOption({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <RadixSelect.Item
      className="select-option"
      value={`option:${value}`}
      disabled={disabled}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator>
        <Check aria-hidden="true" />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}
