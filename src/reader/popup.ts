import { lookupClient } from "@/lookup/client";
import type { ReaderHighlights } from "@/reader/highlights";
import type { ReaderScanner } from "@/reader/scanner";
import type {
  ReaderOptions,
  ReaderConfiguration as Settings,
} from "@/reader/types";
import { t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

export function createPopup(
  options: ReaderOptions,
  getSettings: () => Settings,
  highlights: ReaderHighlights,
  scanner: ReaderScanner,
) {
  let popup: HTMLIFrameElement | undefined;
  let container: HTMLDivElement | undefined;
  let popupRange: Range | undefined;
  let popupSession: string | undefined;
  let popupReady = false;
  let anchor: HTMLElement | undefined;
  let side: "above" | "below" | "left" | "right" = "above";
  let manualSize: { width: number; height: number } | undefined;
  let manualOffset: { left: number; top: number } | undefined;
  let appliedSize = { width: 0, height: 0 };
  const clipping: { element: Element; x: boolean; y: boolean }[] = [];
  const observer = new ResizeObserver((entries) => {
    if (!container) return;
    if (entries.some((entry) => entry.target === container)) {
      const { width, height } = container.getBoundingClientRect();
      if (width !== appliedSize.width || height !== appliedSize.height) {
        manualSize = appliedSize = { width, height };
        reposition();
      }
    }
    if (entries.some((entry) => entry.target === anchor)) reposition();
  });
  function finishResize() {
    if (popup) popup.style.pointerEvents = "";
    window.removeEventListener("pointerup", finishResize, true);
    window.removeEventListener("pointercancel", finishResize, true);
    window.removeEventListener("blur", finishResize);
  }
  function closePopup() {
    finishResize();
    observer.disconnect();
    anchor = undefined;
    manualOffset = undefined;
    clipping.length = 0;
    container?.remove();
    container = undefined;
    popup = undefined;
    popupRange = undefined;
    popupSession = undefined;
    popupReady = false;
    highlights.clearFocus();
  }
  async function show(
    word: NonNullable<ReturnType<ReaderScanner["wordAtPointer"]>>,
  ) {
    const requestedRange = word.range;
    if (
      popupRange &&
      popupRange.compareBoundaryPoints(Range.START_TO_START, requestedRange) ===
        0
    )
      return;
    closePopup();
    popupRange = requestedRange;
    try {
      const prepared = await scanner.prepareLookup(word);
      if (!prepared) {
        if (popupRange === requestedRange) popupRange = undefined;
        return;
      }
      word = prepared;
    } catch (error) {
      console.warn("SrsReader: sentence lookup failed", error);
      if (word.requirePhrase) {
        if (popupRange === requestedRange) popupRange = undefined;
        return;
      }
    }
    if (
      popupRange !== requestedRange ||
      !word.range.startContainer.isConnected ||
      word.range.collapsed
    )
      return;
    const { term, range, context, occurrence, focusRanges, compound } = word;
    const selection = { term, context, occurrence, compound };
    popupRange = range;
    if (options.onLookup) {
      options.onLookup(selection);
      return;
    }
    const session = await lookupClient({
      action: "createSession",
      ...selection,
      refineContext:
        options.scope !== "extensionPages" &&
        word.refineContext &&
        getSettings().udpipe,
    });
    if (
      popupRange !== range ||
      !range.startContainer.isConnected ||
      range.collapsed
    )
      return;
    popupSession = session;
    const node = range.commonAncestorContainer;
    anchor = (
      node instanceof Element ? node : node.parentElement
    ) as HTMLElement;
    for (
      let parent: Element | null = anchor;
      parent && parent !== document.scrollingElement;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      const x = style.overflowX !== "visible";
      const y = style.overflowY !== "visible";
      if (x || y) clipping.push({ element: parent, x, y });
      if (style.position === "fixed") break;
    }
    const box = range.getBoundingClientRect();
    const above = Math.max(1, box.top - 12);
    const below = Math.max(1, innerHeight - box.bottom - 12);
    const left = Math.max(1, box.left - 12);
    const right = Math.max(1, innerWidth - box.right - 12);
    const placement = getSettings().popupPlacement;
    side = placement === "below" || below > above ? "below" : "above";
    if (side === "above" && above < 140 && below > above) side = "below";
    if (side === "below" && below < 140 && above > below) side = "above";
    if (placement === "beside" && Math.max(left, right) >= 240)
      side = right >= left ? "right" : "left";
    const maxWidth = Math.max(
      1,
      side === "left" ? left : side === "right" ? right : innerWidth - 16,
    );
    const maxHeight = Math.max(
      1,
      side === "above" ? above : side === "below" ? below : innerHeight - 16,
    );
    appliedSize = {
      width: Math.min(manualSize?.width ?? 360, maxWidth),
      height: Math.min(manualSize?.height ?? 460, maxHeight),
    };
    popup = document.createElement("iframe");
    popup.dataset.srsReader = "";
    popup.dataset.srsReaderSide = side;
    popup.title = t("srsreader_dictionary");
    popup.allow = "translator; language-detector";
    popup.src =
      browser.runtime.getURL("/lookup.html") +
      `?session=${encodeURIComponent(session)}`;
    Object.assign(popup.style, {
      display: "block",
      width: "100%",
      height: "100%",
      border: "0",
    });
    container = document.createElement("div");
    container.dataset.srsReader = "";
    container.dataset.srsReaderPopup = "";
    Object.assign(container.style, {
      position: "fixed",
      boxSizing: "border-box",
      margin: "0",
      border: "1px solid #8884",
      borderRadius: "5px",
      boxShadow: "0 5px 20px #0002",
      zIndex: "2147483647",
      colorScheme:
        getSettings().theme === "system"
          ? "light dark"
          : getSettings().theme === "oled"
            ? "dark"
            : getSettings().theme,
      background: getSettings().theme === "oled" ? "#000000" : "Canvas",
      resize: "both",
      overflow: "hidden",
      padding: "0",
      width: `${appliedSize.width}px`,
      height: `${appliedSize.height}px`,
      minWidth: `${Math.min(240, maxWidth)}px`,
      minHeight: `${Math.min(140, maxHeight)}px`,
      maxWidth: `${maxWidth}px`,
      maxHeight: `${maxHeight}px`,
      transform: side === "above" ? "translateY(-100%)" : "none",
    });
    container.addEventListener("pointerdown", (event) => {
      if (!container || !popupRange || event.button !== 0) return;
      const bounds = container.getBoundingClientRect();
      if (
        event.clientX < bounds.right - 18 ||
        event.clientY < bounds.bottom - 18
      )
        return;
      container.setPointerCapture(event.pointerId);
      if (popup) popup.style.pointerEvents = "none";
      window.addEventListener("pointerup", finishResize, true);
      window.addEventListener("pointercancel", finishResize, true);
      window.addEventListener("blur", finishResize);
      const word = popupRange.getBoundingClientRect();
      manualOffset = {
        left: bounds.left - word.left,
        top: bounds.top - word.top,
      };
      container.style.transform = "none";
      container.style.maxWidth = `${Math.max(1, innerWidth - bounds.left - 8)}px`;
      container.style.maxHeight = `${Math.max(1, innerHeight - bounds.top - 8)}px`;
      reposition();
    });
    container.append(popup);
    document.documentElement.append(container);
    reposition();
    observer.observe(container);
    observer.observe(anchor);
    for (const focused of focusRanges || [range]) highlights.focus(focused);
  }
  function reposition() {
    if (!container || !popupRange || !anchor) return;
    if (!anchor.isConnected || popupRange.collapsed) {
      closePopup();
      return;
    }
    const box = popupRange.getBoundingClientRect();
    const { width, height } = appliedSize;
    const left = manualOffset
      ? box.left + manualOffset.left
      : Math.max(
          8,
          Math.min(
            innerWidth - width - 8,
            side === "left"
              ? box.left - width - 4
              : side === "right"
                ? box.right + 4
                : box.left,
          ),
        );
    const top = manualOffset
      ? box.top + manualOffset.top
      : side === "above"
        ? box.top - 4
        : side === "below"
          ? box.bottom + 4
          : Math.max(8, Math.min(innerHeight - height - 8, box.top));
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    updateVisibility();
  }
  function updateVisibility() {
    if (!container || !popupRange) return;
    if (!popupRange.startContainer.isConnected || popupRange.collapsed) {
      closePopup();
      return;
    }
    const box = popupRange.getBoundingClientRect();
    const viewport = {
      top: 0,
      left: 0,
      bottom: innerHeight,
      right: innerWidth,
    };
    for (const { element, x, y } of clipping) {
      const bounds = element.getBoundingClientRect();
      if (x) {
        viewport.left = Math.max(viewport.left, bounds.left);
        viewport.right = Math.min(viewport.right, bounds.right);
      }
      if (y) {
        viewport.top = Math.max(viewport.top, bounds.top);
        viewport.bottom = Math.min(viewport.bottom, bounds.bottom);
      }
    }
    const visible =
      box.bottom > viewport.top &&
      box.top < viewport.bottom &&
      box.right > viewport.left &&
      box.left < viewport.right;
    const visibility = visible ? "visible" : "hidden";
    if (container.style.visibility !== visibility)
      container.style.visibility = visibility;
  }
  return {
    show,
    close: closePopup,
    reposition,
    updateVisibility,
    markReady: () => {
      popupReady = true;
    },
    get element() {
      return popup;
    },
    get session() {
      return popupSession;
    },
    get ready() {
      return popupReady;
    },
  };
}
export type ReaderPopup = ReturnType<typeof createPopup>;
