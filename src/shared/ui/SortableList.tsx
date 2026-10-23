import {
  ActionIcon,
  Box,
  Stack,
  Text,
  Tree,
  moveTreeNode,
} from "@mantine/core";
import { GripVertical } from "lucide-react";
import { useId, useMemo, type ReactNode } from "react";
import { t } from "@/shared/i18n/i18n";

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
  children: (item: T, handle: ReactNode) => ReactNode;
}) {
  const help = useId();
  const data = useMemo(
    () => items.map((item) => ({ value: getId(item), label: getLabel(item) })),
    [items, getId, getLabel],
  );
  return (
    <Stack>
      <Text id={help} variant="supporting">
        {t("drag_to_reorder_help")}
      </Text>
      <Tree
        data={data}
        withDragHandle
        allowDrop={({ position }) => !disabled && position !== "inside"}
        onDragDrop={(payload) => {
          // Removing this callback during saves also removes Mantine's drag cleanup.
          if (disabled) return;
          const reordered = moveTreeNode(data, payload);
          const index = reordered.findIndex(
            (node) => node.value === payload.draggedNode,
          );
          const target = data[index]!;
          if (target.value !== payload.draggedNode)
            onMove(payload.draggedNode, target.value);
        }}
        styles={{
          root: {
            display: "flex",
            flexDirection: "column",
            gap: "var(--mantine-spacing-md)",
          },
          label: { cursor: "default" },
        }}
        renderNode={({ node, elementProps, dragHandleProps }) => {
          const index = items.findIndex((item) => getId(item) === node.value);
          const item = items[index]!;
          const label = t("reorder_item", { name: getLabel(item) });
          return (
            <Box
              {...elementProps}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {children(
                item,
                <ActionIcon
                  {...dragHandleProps}
                  onMouseDown={
                    disabled ? undefined : dragHandleProps?.onMouseDown
                  }
                  variant="subtle"
                  disabled={items.length < 2}
                  aria-disabled={disabled}
                  data-disabled={disabled || undefined}
                  aria-label={label}
                  aria-describedby={help}
                  title={label}
                  style={{
                    cursor: disabled ? undefined : "grab",
                    flexShrink: 0,
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                      return;
                    event.preventDefault();
                    const target =
                      items[index + (event.key === "ArrowUp" ? -1 : 1)];
                    if (!disabled && target) onMove(node.value, getId(target));
                  }}
                >
                  <GripVertical aria-hidden="true" size={16} />
                </ActionIcon>,
              )}
            </Box>
          );
        }}
      />
    </Stack>
  );
}
