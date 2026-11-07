import { matchesModifiers, readerKeysSchema } from "@/reader/controls";
import type { ReaderPopup } from "@/reader/popup";
import type { ReaderScanner } from "@/reader/scanner";
import type {
  Pointer,
  ReaderOptions,
  ReaderConfiguration as Settings,
} from "@/reader/types";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

export function installReaderInput(
  ctx: ContentScriptContext,
  root: HTMLElement,
  excluded: string,
  options: ReaderOptions,
  getSettings: () => Settings,
  isActive: () => boolean,
  popup: ReaderPopup,
  scanner: ReaderScanner,
) {
  let pointer: Pointer | undefined;
  const heldKeys = new Set<string>();
  let modifiers = {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  };
  const suppressedButtons = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let touchTimer: ReturnType<typeof setTimeout> | undefined;
  let touchStart = 0;
  let touchId: number | undefined;
  let touchPoint: Pointer | undefined;
  let touchHeld = false;
  let lastTap = 0;
  let lastTapPoint: Pointer | undefined;
  let lastTouch = 0;
  let pendingTap: ReturnType<typeof setTimeout> | undefined;
  const wordAtPointer = () => scanner.wordAtPointer(pointer);
  function relayKeys(event?: KeyboardEvent, pressed = false) {
    if (event)
      modifiers = {
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      };
    const input = {
      type: "srs-reader-keys",
      session: options.onLookup
        ? new URLSearchParams(location.search).get("session")
        : popup.session,
      keys: [...heldKeys],
      code: event?.code || "",
      pressed,
      ...modifiers,
    };
    if (options.onLookup) window.parent.postMessage(input, "*");
    else
      popup.element?.contentWindow?.postMessage(
        input,
        new URL(browser.runtime.getURL("/")).origin,
      );
  }
  function activate(useSelection = false) {
    if (!isActive()) return false;
    const selected = scanner.selectedWord();
    const word =
      selected &&
      (useSelection ||
        (pointer &&
          [...selected.range.getClientRects()].some(
            (rect) =>
              pointer!.clientX >= rect.left &&
              pointer!.clientX <= rect.right &&
              pointer!.clientY >= rect.top &&
              pointer!.clientY <= rect.bottom,
          )))
        ? selected
        : wordAtPointer();
    if (!word) return false;
    clearTimeout(timer);
    void popup.show(word).catch(console.warn);
    return true;
  }
  function hover(
    event: Pick<MouseEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  ) {
    clearTimeout(timer);
    if (
      !getSettings().lookupBindings.some(
        (binding) =>
          binding.type === "hover" &&
          matchesModifiers(binding, event) &&
          (!binding.code || heldKeys.has(binding.code)),
      )
    )
      return;
    const word = wordAtPointer();
    if (word)
      timer = setTimeout(() => void popup.show(word).catch(console.warn), 260);
  }
  function consume(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function cancelTouch() {
    clearTimeout(touchTimer);
    clearTimeout(pendingTap);
    touchId = undefined;
    touchPoint = undefined;
    touchStart = 0;
    touchHeld = false;
    lastTap = 0;
    lastTapPoint = undefined;
  }
  ctx.addEventListener(
    window,
    "scroll",
    () => {
      cancelTouch();
      popup.reposition();
    },
    { capture: true, passive: true },
  );
  ctx.addEventListener(window, "resize", popup.reposition);
  ctx.addEventListener(document, "mousemove", (event) => {
    if (Date.now() - lastTouch < 800) return;
    pointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target,
    };
    hover(event);
  });
  ctx.addEventListener(window, "message", (event) => {
    const session = options.onLookup
      ? new URLSearchParams(location.search).get("session")
      : popup.session;
    if (
      event.source !==
      (options.onLookup ? window.parent : popup.element?.contentWindow)
    )
      return;
    if (
      !options.onLookup &&
      event.origin !== new URL(browser.runtime.getURL("/")).origin
    )
      return;
    if (!options.onLookup && event.data?.type === "srs-reader-ready") {
      if (event.data.session === session) {
        popup.markReady();
        relayKeys();
      } else popup.syncSession();
    }
    const parsed = readerKeysSchema.safeParse(event.data);
    if (!parsed.success || parsed.data.session !== session) return;
    const input = parsed.data;
    const wasHeld = heldKeys.has(input.code);
    heldKeys.clear();
    for (const code of input.keys) heldKeys.add(code);
    modifiers = {
      ctrlKey: input.ctrlKey,
      altKey: input.altKey,
      shiftKey: input.shiftKey,
      metaKey: input.metaKey,
    };
    if (!options.onLookup || !isActive()) return;
    if (
      input.pressed &&
      !wasHeld &&
      getSettings().lookupBindings.some(
        (binding) =>
          binding.type === "key" &&
          binding.code === input.code &&
          matchesModifiers(binding, input),
      )
    )
      activate(true);
    hover(input);
  });
  if (options.onLookup)
    window.parent.postMessage(
      {
        type: "srs-reader-ready",
        session: new URLSearchParams(location.search).get("session"),
      },
      "*",
    );
  ctx.addEventListener(
    document,
    "toggle",
    (event) => {
      if (event.target instanceof HTMLElement && root.contains(event.target))
        scanner.collect(event.target);
    },
    { capture: true },
  );
  ctx.addEventListener(
    document,
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        if (options.onLookup) return;
        if (popup.ready) {
          relayKeys(event, true);
          consume(event);
          return;
        }
        clearTimeout(timer);
        popup.close();
        return;
      }
      if (!isActive() || (event.target as Element)?.closest(excluded)) return;
      heldKeys.add(event.code);
      relayKeys(event, true);
      if (
        !event.repeat &&
        getSettings().lookupBindings.some(
          (binding) =>
            binding.type === "key" &&
            binding.code === event.code &&
            matchesModifiers(binding, event),
        ) &&
        activate(true)
      )
        consume(event);
      if (
        getSettings().lookupBindings.some(
          (binding) =>
            binding.type === "hover" &&
            binding.code === event.code &&
            matchesModifiers(binding, event),
        ) &&
        wordAtPointer()
      )
        consume(event);
      hover(event);
    },
    { capture: true },
  );
  ctx.addEventListener(
    document,
    "keyup",
    (event) => {
      heldKeys.delete(event.code);
      relayKeys(event);
      clearTimeout(timer);
    },
    { capture: true },
  );
  ctx.addEventListener(window, "blur", () => {
    if (popup.element && document.activeElement === popup.element) return;
    heldKeys.clear();
    modifiers = {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };
    relayKeys();
    suppressedButtons.clear();
    pointer = undefined;
    clearTimeout(timer);
    cancelTouch();
  });
  ctx.addEventListener(
    document,
    "touchstart",
    (event) => {
      const touches = (event as TouchEvent).touches;
      const touch = touches[0];
      clearTimeout(timer);
      suppressedButtons.clear();
      clearTimeout(touchTimer);
      clearTimeout(pendingTap);
      touchHeld = false;
      touchId = undefined;
      touchPoint = undefined;
      lastTouch = Date.now();
      if (touches.length !== 1 || !touch) {
        cancelTouch();
        return;
      }
      if ((event.target as Element)?.closest("[data-srs-reader]")) {
        cancelTouch();
        return;
      }
      popup.close();
      if (
        !isActive() ||
        !root.contains(event.target as Node) ||
        (event.target as Element)?.closest(excluded)
      ) {
        cancelTouch();
        return;
      }
      touchId = touch.identifier;
      touchPoint = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: event.target,
      };
      pointer = touchPoint;
      touchStart = Date.now();
      if (
        lastTapPoint &&
        Math.hypot(
          touch.clientX - lastTapPoint.clientX,
          touch.clientY - lastTapPoint.clientY,
        ) > 24
      )
        lastTap = 0;
      if (
        getSettings().lookupBindings.some(
          (binding) => binding.type === "touch" && binding.gesture === "hold",
        )
      )
        // Beat the browser's native long-press selection delay.
        touchTimer = setTimeout(() => {
          pointer = touchPoint;
          touchHeld = activate();
          if (touchHeld) {
            lastTap = 0;
            lastTapPoint = undefined;
          }
        }, 300);
    },
    { capture: true, passive: true },
  );
  ctx.addEventListener(
    document,
    "touchmove",
    (event) => {
      const touches = (event as TouchEvent).touches;
      const touch = touches[0];
      if (
        touches.length !== 1 ||
        !touch ||
        !touchPoint ||
        touch.identifier !== touchId ||
        Math.hypot(
          touch.clientX - touchPoint.clientX,
          touch.clientY - touchPoint.clientY,
        ) > 10
      )
        cancelTouch();
    },
    { capture: true, passive: true },
  );
  ctx.addEventListener(
    document,
    "touchend",
    (event) => {
      const touchEvent = event as TouchEvent;
      const touch = touchEvent.changedTouches[0];
      if (!touch || touch.identifier !== touchId || !touchPoint) return;
      if (
        Math.hypot(
          touch.clientX - touchPoint.clientX,
          touch.clientY - touchPoint.clientY,
        ) > 10
      ) {
        cancelTouch();
        return;
      }
      clearTimeout(touchTimer);
      lastTouch = Date.now();
      touchId = undefined;
      pointer = touchPoint;
      touchPoint = undefined;
      if (touchHeld) {
        touchHeld = false;
        consume(event);
        return;
      }
      if (
        !isActive() ||
        touchEvent.touches.length ||
        Date.now() - touchStart > 500
      ) {
        cancelTouch();
        return;
      }
      const bindings = getSettings().lookupBindings;
      const doubleTap = bindings.some(
        (binding) =>
          binding.type === "touch" && binding.gesture === "doubleTap",
      );
      if (doubleTap && lastTap && Date.now() - lastTap < 320) {
        lastTap = 0;
        lastTapPoint = undefined;
        if (activate()) consume(event);
      } else if (doubleTap) {
        lastTap = Date.now();
        lastTapPoint = pointer;
        const tapPoint = pointer;
        pendingTap = setTimeout(() => {
          pointer = tapPoint;
          if (
            getSettings().lookupBindings.some(
              (binding) =>
                binding.type === "touch" && binding.gesture === "tap",
            )
          )
            activate();
          lastTap = 0;
          lastTapPoint = undefined;
        }, 320);
      } else if (
        bindings.some(
          (binding) => binding.type === "touch" && binding.gesture === "tap",
        ) &&
        activate()
      )
        consume(event);
    },
    { capture: true, passive: false },
  );
  ctx.addEventListener(document, "touchcancel", cancelTouch, {
    capture: true,
    passive: true,
  });
  ctx.addEventListener(
    document,
    "mousedown",
    (event) => {
      if (Date.now() - lastTouch < 800) return;
      suppressedButtons.delete(event.button);
      if ((event.target as Element)?.closest("[data-srs-reader]")) return;
      if (!root.contains(event.target as Node)) {
        popup.close();
        return;
      }
      pointer = {
        clientX: event.clientX,
        clientY: event.clientY,
        target: event.target,
      };
      if (
        !(event.target as Element)?.closest(excluded) &&
        getSettings().lookupBindings.some(
          (binding) =>
            binding.type === "mouse" &&
            binding.button === event.button &&
            matchesModifiers(binding, event),
        ) &&
        activate()
      ) {
        suppressedButtons.add(event.button);
        consume(event);
      } else popup.close();
    },
    { capture: true },
  );
  for (const eventName of [
    "mouseup",
    "auxclick",
    "click",
    "contextmenu",
  ] as const)
    ctx.addEventListener(
      document,
      eventName,
      (event) => {
        if (eventName === "contextmenu" && touchHeld) {
          consume(event);
          return;
        }
        if (suppressedButtons.has(event.button)) consume(event);
      },
      { capture: true },
    );
  return {
    cancel: () => {
      clearTimeout(timer);
      cancelTouch();
    },
    dispose: () => {
      clearTimeout(timer);
      cancelTouch();
      heldKeys.clear();
      suppressedButtons.clear();
      pointer = undefined;
    },
  };
}
