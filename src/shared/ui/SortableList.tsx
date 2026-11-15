import { ActionIcon, Box, Group, Stack, VisuallyHidden } from "@mantine/core";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useId, type ReactNode } from "react";
import { t } from "@/shared/i18n/i18n";

/** Controlled flat list with touch and keyboard reorder controls. */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  onMove,
  disabled = false,
  children,
}: {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onMove: (id: string, target: string) => void;
  disabled?: boolean;
  children: (item: T, controls: ReactNode) => ReactNode;
}) {
  const help = useId();
  return (
    <Stack gap="xs">
      <VisuallyHidden id={help}>{t("reorder_help")}</VisuallyHidden>
      <Stack gap="xs" role="list">
        {items.map((item, index) => {
          const id = getId(item);
          const name = getLabel(item);
          const up = t("move_item_up", { name });
          const down = t("move_item_down", { name });
          return (
            <Box key={id} role="listitem">
              {children(
                item,
                <Group
                  gap={0}
                  wrap="nowrap"
                  flex="0 0 auto"
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    const target =
                      items[index + (event.key === "ArrowUp" ? -1 : 1)];
                    if (!disabled && target) onMove(id, getId(target));
                  }}
                >
                  <ActionIcon
                    variant="subtle"
                    disabled={disabled || index === 0}
                    aria-label={up}
                    aria-describedby={help}
                    title={up}
                    onClick={() => onMove(id, getId(items[index - 1]!))}
                  >
                    <ArrowUp aria-hidden="true" size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    disabled={disabled || index === items.length - 1}
                    aria-label={down}
                    aria-describedby={help}
                    title={down}
                    onClick={() => onMove(id, getId(items[index + 1]!))}
                  >
                    <ArrowDown aria-hidden="true" size={16} />
                  </ActionIcon>
                </Group>,
              )}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
