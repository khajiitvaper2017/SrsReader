import {
  ActionIcon,
  Checkbox,
  Group,
  SimpleGrid,
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
import { BindingInput } from "@/shared/ui/BindingInput";
import { Trash2 } from "lucide-react";

export function LookupControls({
  value,
  onChange,
}: {
  value: LookupBinding[];
  onChange: (bindings: LookupBinding[]) => void;
}) {
  const add = (binding: LookupBinding | null) => {
    if (binding && !value.some((b) => bindingKey(b) === bindingKey(binding)))
      onChange([...value, binding]);
  };
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
              label={bindingLabel(binding)}
              key={key}
            />
          );
        })}
      </Group>
      {custom.map((binding) => (
        <Group key={bindingKey(binding)} align="center">
          <Text>{bindingLabel(binding)}</Text>
          <ActionIcon
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
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <BindingInput
          label={t("add_lookup_binding")}
          value={null}
          onChange={add}
        />
        <BindingInput
          label={t("hold_key_hover")}
          value={null}
          onChange={add}
          hover
        />
      </SimpleGrid>
    </Stack>
  );
}
