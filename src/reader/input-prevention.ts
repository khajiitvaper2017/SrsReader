import { matchesModifiers } from "@/reader/controls";
import type { ReaderConfiguration as Settings } from "@/reader/types";

export type PageScope = "webpages" | "popups" | "extensionPages";

function overText(event: MouseEvent) {
  const caret = document.caretPositionFromPoint(event.clientX, event.clientY);
  if (!caret || caret.offsetNode.nodeType !== Node.TEXT_NODE) return false;
  const text = caret.offsetNode;
  for (const offset of [caret.offset - 1, caret.offset]) {
    if (offset < 0 || offset >= text.textContent!.length) continue;
    if (!text.textContent!.charAt(offset).trim()) continue;
    const range = document.createRange();
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
    if (
      Array.from(range.getClientRects()).some(
        (rect) =>
          event.clientX >= rect.left &&
          event.clientX < rect.right &&
          event.clientY >= rect.top &&
          event.clientY < rect.bottom,
      )
    )
      return true;
  }
  return false;
}

export function installInputPrevention(
  getSettings: () => Settings | undefined,
  scope: PageScope,
) {
  const suppressedButtons = new Set<number>();
  const prevent = (event: MouseEvent) => {
    if ((event.target as Element)?.closest("[data-binding-input]")) return;
    if (event.type === "mousedown") suppressedButtons.delete(event.button);
    const settings = getSettings();
    if (!settings?.setupComplete) return;
    const matchesBinding = settings.lookupBindings.some(
      (binding) =>
        binding.type === "mouse" &&
        binding.button === event.button &&
        matchesModifiers(binding, event),
    );
    const options =
      event.button === 1
        ? settings.preventMiddleMouse
        : event.button === 3 || event.button === 4
          ? settings.preventBackForward
          : undefined;
    if (!options) return;
    if (
      suppressedButtons.has(event.button) ||
      (matchesBinding &&
        (options[scope] ||
          (options.searchFields &&
            (event.target as Element)?.closest('input[type="search"]')) ||
          (options.textHover && overText(event))))
    ) {
      if (event.type === "mousedown") suppressedButtons.add(event.button);
      if (
        event.button === 1
          ? event.type === "mouseup"
          : event.type === "mousedown"
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.type === "auxclick") suppressedButtons.delete(event.button);
  };
  const events = ["mousedown", "mouseup", "auxclick"] as const;
  for (const name of events) document.addEventListener(name, prevent, true);
  return () => {
    for (const name of events)
      document.removeEventListener(name, prevent, true);
  };
}
