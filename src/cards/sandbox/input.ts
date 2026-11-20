import type { Settings } from "@/settings/model";
import type { matchesReviewBinding, ReviewInput } from "@/srs/controls";
import type { CardFrameMessage, CardGesture } from "@/cards/sandbox/protocol";

// Serialized into the card frame before package scripts run.
export function installCardInput(
  bindings: Settings["reviewBindings"],
  send: (input: ReviewInput) => void,
  matches: typeof matchesReviewBinding,
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
  return () => {
    window.removeEventListener("keydown", handle, true);
    window.removeEventListener("mousedown", handle, true);
    for (const type of trailing)
      window.removeEventListener(type, preventMouse, true);
  };
}

// Both the review viewport and the sandboxed document receive their own DOM events.
export function installCardGestures(
  target: EventTarget,
  side: NonNullable<CardFrameMessage["gesture"]>,
  send: (gesture: CardGesture) => void,
  canSwipeUp: () => boolean,
  scan = false,
  preview?: (gesture: CardGesture, progress: number) => void,
) {
  const listeners = new AbortController();
  const capture = { capture: true, signal: listeners.signal };
  const closest = Element.prototype.closest;
  const interactive = (element: EventTarget | null) =>
    element instanceof Element &&
    closest.call(
      element,
      'input, textarea, select, button, a, label, summary, audio, video, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="menu"], [role="dialog"], [role="tab"], [onclick]',
    );
  const selected = () => !!window.getSelection()?.toString();
  let click: ReturnType<typeof setTimeout> | undefined;
  if (side === "front") {
    target.addEventListener(
      "click",
      (input) => {
        const event = input as MouseEvent;
        if (
          !event.isTrusted ||
          event.defaultPrevented ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          event.shiftKey ||
          interactive(event.target) ||
          selected()
        )
          return;
        clearTimeout(click);
        if (!scan || event.detail === 0) send("reveal");
        else if (event.detail === 1)
          click = setTimeout(() => {
            if (!selected()) send("reveal");
          }, 250);
      },
      { signal: listeners.signal },
    );
    target.addEventListener("dblclick", () => clearTimeout(click), capture);
  }

  let start: Touch | undefined;
  let direction: CardGesture | undefined;
  const displacement = (touch: Touch, origin: Touch) => ({
    // The review panel moves during a swipe, including its iframe viewport.
    x: touch.screenX - origin.screenX,
    y: touch.screenY - origin.screenY,
  });
  const reset = () => {
    start = undefined;
    if (direction) preview?.(direction, 0);
    direction = undefined;
  };
  target.addEventListener(
    "touchstart",
    (input) => {
      const event = input as TouchEvent;
      reset();
      start =
        event.isTrusted &&
        event.touches.length === 1 &&
        (side === "back" || canSwipeUp()) &&
        !interactive(event.target) &&
        !selected()
          ? event.touches[0]
          : undefined;
    },
    capture,
  );
  target.addEventListener(
    "touchmove",
    (input) => {
      const event = input as TouchEvent;
      if (!event.isTrusted || !start) return;
      const { x, y } = displacement(event.touches[0]!, start);
      if (!direction && Math.max(Math.abs(x), Math.abs(y)) >= 12) {
        if (side === "front" && -y > Math.abs(x)) direction = "reveal";
        else if (side === "back" && Math.abs(x) > Math.abs(y))
          direction = x < 0 ? "again" : "good";
        else start = undefined;
      }
      if (!direction) return;
      if (event.cancelable) event.preventDefault();
      if (side === "back") direction = x < 0 ? "again" : "good";
      preview?.(
        direction,
        Math.min(1, Math.max(0, (side === "front" ? -y : Math.abs(x)) / 56)),
      );
    },
    { ...capture, passive: false },
  );
  target.addEventListener(
    "touchend",
    (input) => {
      const event = input as TouchEvent;
      if (!event.isTrusted || !start) return;
      const { x, y } = displacement(event.changedTouches[0]!, start);
      const swipe = direction;
      reset();
      if (selected()) return;
      if (
        (swipe === "reveal" && -y >= 56 && -y > Math.abs(x)) ||
        (swipe &&
          swipe !== "reveal" &&
          Math.abs(x) >= 56 &&
          Math.abs(x) > Math.abs(y))
      )
        send(swipe === "reveal" ? swipe : x < 0 ? "again" : "good");
    },
    capture,
  );
  target.addEventListener("touchcancel", reset, capture);
  return () => {
    listeners.abort();
    clearTimeout(click);
  };
}
