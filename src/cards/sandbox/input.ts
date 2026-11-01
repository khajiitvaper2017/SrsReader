import type { Settings } from "@/settings/model";
import type { matchesReviewBinding, ReviewInput } from "@/srs/controls";

// Serialized into the card frame before package scripts run.
export function installCardInput(
  bindings: Settings["reviewBindings"],
  send: (input: ReviewInput) => void,
  matches: typeof matchesReviewBinding,
) {
  const suppressed = new Set<number>();
  const closest = Element.prototype.closest;
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
      (event.target instanceof Element &&
        closest.call(
          event.target,
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="dialog"], [role="tab"]',
        )) ||
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
