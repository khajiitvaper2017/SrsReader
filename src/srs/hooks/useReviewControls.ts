import type { Settings } from "@/settings/model";
import { matchesReviewBinding, reviewActions } from "@/srs/controls";
import { useEffect, useRef } from "react";

export function useReviewControls({
  settings,
  onGrade,
  onFlip,
  onUndo,
  onPauseTimer,
}: {
  settings: Settings;
  onGrade?: (rating: number) => void;
  onFlip?: () => void;
  onUndo?: () => void;
  onPauseTimer?: () => void;
}) {
  const suppressed = useRef(new Set<number>());
  useEffect(() => {
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const handle = (event: KeyboardEvent | MouseEvent) => {
      if ("button" in event) suppressed.current.delete(event.button);
      if (
        event.defaultPrevented ||
        ("repeat" in event && (event.repeat || event.isComposing))
      )
        return;
      if (
        (event.target as Element)?.closest(
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="dialog"], [role="tab"]',
        )
      )
        return;
      const action = reviewActions.find((action) =>
        matchesReviewBinding(settings.reviewBindings[action], event),
      );
      if (!action) return;
      const rating = reviewActions.indexOf(action) + 1;
      const callback =
        action === "flip"
          ? onFlip
          : action === "undo"
            ? onUndo
            : action === "pause_timer"
              ? onPauseTimer
              : onGrade &&
                  (!settings.onlyAgainGood || rating === 1 || rating === 3)
                ? () => onGrade(rating)
                : undefined;
      if (!callback) return;
      if ("button" in event) suppressed.current.add(event.button);
      stop(event);
      callback();
    };
    const preventMouse = (event: MouseEvent) => {
      if (suppressed.current.has(event.button)) stop(event);
    };
    const clear = () => suppressed.current.clear();
    window.addEventListener("keydown", handle, true);
    window.addEventListener("mousedown", handle, true);
    window.addEventListener("blur", clear);
    for (const type of ["mouseup", "click", "auxclick", "contextmenu"] as const)
      window.addEventListener(type, preventMouse, true);
    return () => {
      window.removeEventListener("keydown", handle, true);
      window.removeEventListener("mousedown", handle, true);
      window.removeEventListener("blur", clear);
      for (const type of [
        "mouseup",
        "click",
        "auxclick",
        "contextmenu",
      ] as const)
        window.removeEventListener(type, preventMouse, true);
    };
  });
}
