import type { Settings } from "@/settings/model";
import type { matchesReviewBinding, ReviewInput } from "@/srs/controls";
import type { CardFrameMessage, CardGesture } from "@/cards/sandbox/protocol";

// Serialized into the card frame before package scripts run.
export function installCardInput(
  bindings: Settings["reviewBindings"],
  send: (input: ReviewInput | { gesture: CardGesture }) => void,
  matches: typeof matchesReviewBinding,
  side?: CardFrameMessage["gesture"],
  scan?: boolean,
) {
  const suppressed = new Set<number>();
  const closest = Element.prototype.closest;
  const inputTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    closest.call(
      target,
      'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="dialog"], [role="tab"]',
    );
  const bound = (event: KeyboardEvent | MouseEvent) =>
    Object.values(bindings).some((binding) => matches(binding, event));
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const handle = (event: KeyboardEvent | MouseEvent) => {
    if (!event.isTrusted) return;
    if ("button" in event) suppressed.delete(event.button);
    if (
      event.defaultPrevented ||
      ("repeat" in event && (event.repeat || event.isComposing)) ||
      inputTarget(event.target) ||
      !bound(event)
    )
      return;
    if ("button" in event) suppressed.add(event.button);
    stop(event);
    send({
      type: "button" in event ? "mouse" : "key",
      code: "code" in event ? event.code : "",
      button: "button" in event ? event.button : 0,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    });
  };
  const preventMouse = (event: MouseEvent) => {
    if (
      event.isTrusted &&
      (suppressed.has(event.button) || (event.button >= 3 && bound(event)))
    )
      stop(event);
  };
  window.addEventListener("keydown", handle, true);
  window.addEventListener("mousedown", handle, true);
  const trailing = ["mouseup", "click", "auxclick", "contextmenu"] as const;
  for (const type of trailing)
    window.addEventListener(type, preventMouse, true);
  // The outer frame also relays bindings. Gestures belong to the card document.
  if (side) {
    const interactive = (target: EventTarget | null) =>
      inputTarget(target) ||
      (target instanceof Element &&
        closest.call(
          target,
          'label, summary, audio, video, [role="button"], [onclick]',
        ));
    const selected = () => !!window.getSelection()?.toString();
    let canSwipeUp = true;
    if (side === "front") {
      // Leave upward scrolling available until the bottom of a long front is visible.
      window.addEventListener(
        "DOMContentLoaded",
        () => {
          const end = document.createElement("span");
          end.style.cssText =
            "display:block;width:1px;height:1px;pointer-events:none";
          end.setAttribute("aria-hidden", "true");
          document.body.append(end);
          new IntersectionObserver(([entry]) => {
            canSwipeUp = !!entry?.isIntersecting;
          }).observe(end);
        },
        { once: true },
      );
      let click: ReturnType<typeof setTimeout> | undefined;
      window.addEventListener("click", (event) => {
        if (
          event.isTrusted &&
          !event.defaultPrevented &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !interactive(event.target) &&
          !selected()
        ) {
          clearTimeout(click);
          if (!scan || event.detail === 0) send({ gesture: "reveal" });
          else if (event.detail === 1)
            click = setTimeout(() => {
              if (!selected()) send({ gesture: "reveal" });
            }, 250);
        }
      });
      window.addEventListener("dblclick", () => clearTimeout(click), true);
    }
    let start: Touch | undefined;
    let direction: CardGesture | undefined;
    const displacement = (touch: Touch, origin: Touch) => ({
      x: touch.clientX - origin.clientX,
      y: touch.clientY - origin.clientY,
    });
    window.addEventListener(
      "touchstart",
      (event) => {
        direction = undefined;
        start =
          event.isTrusted &&
          event.touches.length === 1 &&
          canSwipeUp &&
          !interactive(event.target) &&
          !selected()
            ? event.touches[0]
            : undefined;
      },
      true,
    );
    window.addEventListener(
      "touchmove",
      (event) => {
        if (!event.isTrusted || !start) return;
        const { x, y } = displacement(event.touches[0]!, start);
        if (!direction && Math.max(Math.abs(x), Math.abs(y)) >= 12) {
          if (side === "front" && -y > Math.abs(x)) direction = "reveal";
          else if (side === "back" && Math.abs(x) > Math.abs(y))
            direction = x < 0 ? "again" : "good";
          else start = undefined;
        }
        if (direction && event.cancelable) event.preventDefault();
      },
      { capture: true, passive: false },
    );
    window.addEventListener(
      "touchend",
      (event) => {
        if (!event.isTrusted || !start) return;
        const { x, y } = displacement(event.changedTouches[0]!, start);
        start = undefined;
        if (selected()) return;
        if (
          (direction === "reveal" && -y >= 56 && -y > Math.abs(x)) ||
          (direction === "again" && -x >= 56 && -x > Math.abs(y)) ||
          (direction === "good" && x >= 56 && x > Math.abs(y))
        )
          send({ gesture: direction });
      },
      true,
    );
    window.addEventListener(
      "touchcancel",
      () => {
        start = undefined;
      },
      true,
    );
  }
  return () => {
    window.removeEventListener("keydown", handle, true);
    window.removeEventListener("mousedown", handle, true);
    for (const type of trailing)
      window.removeEventListener(type, preventMouse, true);
  };
}
