import { ActionIcon, Box, Stack, Text } from "@mantine/core";
import { GripVertical } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
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
  const rows = useRef(new Map<string, HTMLDivElement>());
  const active = useRef<{
    start: number;
    pointerId: number;
    target: string;
    moved: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    offset: number;
    target: string;
  } | null>(null);
  function clearDrag() {
    active.current = null;
    setDrag(null);
  }
  return (
    <Stack>
      <Text id={help} variant="supporting">
        {t("drag_to_reorder_help")}
      </Text>
      <Stack role="list">
        {items.map((item, index) => {
          const id = getId(item);
          const label = t("reorder_item", { name: getLabel(item) });
          const moving = drag?.id === id;
          return (
            <Box
              key={id}
              ref={(element) => {
                if (element) rows.current.set(id, element);
                else rows.current.delete(id);
              }}
              role="listitem"
              pos="relative"
              style={{
                transform: moving ? `translateY(${drag.offset}px)` : undefined,
                zIndex: moving ? 1 : undefined,
                outline:
                  drag?.target === id && !moving
                    ? "2px solid var(--mantine-primary-color-filled)"
                    : undefined,
                outlineOffset: 2,
              }}
            >
              {children(
                item,
                <ActionIcon
                  variant="subtle"
                  disabled={items.length < 2}
                  aria-disabled={disabled}
                  data-disabled={disabled || undefined}
                  aria-label={label}
                  aria-describedby={help}
                  title={label}
                  style={{
                    cursor: moving ? "grabbing" : "grab",
                    touchAction: "none",
                    flexShrink: 0,
                  }}
                  onPointerDown={(event) => {
                    if (disabled || event.button !== 0 || !event.isPrimary)
                      return;
                    event.preventDefault();
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    active.current = {
                      start: event.clientY,
                      pointerId: event.pointerId,
                      target: id,
                      moved: false,
                    };
                  }}
                  onPointerMove={(event) => {
                    const current = active.current;
                    if (!current || current.pointerId !== event.pointerId)
                      return;
                    const offset = event.clientY - current.start;
                    if (Math.abs(offset) < 5 && !current.moved) return;
                    current.moved = true;
                    current.target = id;
                    for (const [target, row] of rows.current) {
                      if (target === id) continue;
                      const rect = row.getBoundingClientRect();
                      if (
                        event.clientY >= rect.top &&
                        event.clientY <= rect.bottom
                      )
                        current.target = target;
                    }
                    setDrag({ id, offset, target: current.target });
                  }}
                  onPointerUp={(event) => {
                    const current = active.current;
                    if (!current || current.pointerId !== event.pointerId)
                      return;
                    clearDrag();
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    if (current.target !== id && !disabled)
                      onMove(id, current.target);
                  }}
                  onPointerCancel={clearDrag}
                  onLostPointerCapture={clearDrag}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") clearDrag();
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                      return;
                    event.preventDefault();
                    const target =
                      items[index + (event.key === "ArrowUp" ? -1 : 1)];
                    if (!disabled && target) onMove(id, getId(target));
                  }}
                >
                  <GripVertical aria-hidden="true" size={16} />
                </ActionIcon>,
              )}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
