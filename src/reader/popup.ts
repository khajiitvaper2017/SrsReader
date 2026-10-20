import { lookupClient } from "@/lookup/client";
import type { Occurrence } from "@/languages/analysis";
import type { ReaderHighlights } from "@/reader/highlights";
import type {
  ReaderOptions,
  ReaderConfiguration as Settings,
} from "@/reader/types";
import { t } from "@/shared/i18n/i18n";
import type { ReadingContext } from "@/vocabulary/model";
import { browser } from "wxt/browser";

export function createPopup(
  options: ReaderOptions,
  getSettings: () => Settings,
  highlights: ReaderHighlights,
) {
  let popup: HTMLIFrameElement | undefined;
  let container: HTMLDivElement | undefined;
  let popupRange: Range | undefined;
  let popupSession: string | undefined;
  let popupReady = false;
  let manualSize: { width: number; height: number } | undefined;
  let appliedSize = { width: 0, height: 0 };
  const observer = new ResizeObserver(() => {
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    if (width === appliedSize.width && height === appliedSize.height) return;
    manualSize = appliedSize = { width, height };
  });
  function closePopup() {
    observer.disconnect();
    container?.remove();
    container = undefined;
    popup = undefined;
    popupRange = undefined;
    popupSession = undefined;
    popupReady = false;
    highlights.clearFocus();
  }
  async function show(
    term: string,
    range: Range,
    context: ReadingContext,
    occurrence?: Occurrence,
    focusRanges?: Range[],
  ) {
    if (
      popupRange &&
      popupRange.compareBoundaryPoints(Range.START_TO_START, range) === 0
    )
      return;
    closePopup();
    if (options.onLookup) {
      options.onLookup(term, context, occurrence);
      return;
    }
    popupRange = range;
    const session = await lookupClient({
      action: "createSession",
      term,
      context,
      occurrence,
    });
    if (popupRange !== range || !range.startContainer.isConnected) return;
    popupSession = session;
    popup = document.createElement("iframe");
    popup.dataset.srsReader = "";
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
      border: "1px solid #8884",
      borderRadius: "5px",
      boxShadow: "0 5px 20px #0002",
      zIndex: "2147483647",
      colorScheme:
        getSettings().theme === "system" ? "light dark" : getSettings().theme,
      background: "Canvas",
      resize: "both",
      overflow: "hidden",
      paddingBottom: "12px",
    });
    sizePopup(180);
    container.append(popup);
    document.documentElement.append(container);
    observer.observe(container);
    for (const focused of focusRanges || [range]) highlights.focus(focused);
  }
  function sizePopup(requestedHeight: number) {
    if (!popup || !container || !popupRange) return;
    if (manualSize && container.style.width) return;
    const box = popupRange.getBoundingClientRect();
    const width = Math.max(
      1,
      Math.min(manualSize?.width ?? 360, innerWidth - 16),
    );
    const height = Math.max(
      1,
      Math.min(
        manualSize?.height ??
          Math.min(Math.max(140, requestedHeight + 12), 460),
        innerHeight - 16,
      ),
    );
    const side =
      popup.dataset.srsReaderSide ||
      (getSettings().popupPlacement === "beside"
        ? box.right + width + 12 <= innerWidth
          ? "right"
          : "left"
        : getSettings().popupPlacement === "below" ||
            (getSettings().popupPlacement === "auto" &&
              box.bottom + 140 + 12 <= innerHeight)
          ? "below"
          : "above");
    popup.dataset.srsReaderSide = side;
    const left =
      side === "right"
        ? Math.min(innerWidth - width - 8, box.right + 4)
        : side === "left"
          ? Math.max(8, box.left - width - 4)
          : Math.max(8, Math.min(box.left, innerWidth - width - 8));
    const top =
      side === "below"
        ? Math.min(innerHeight - height - 8, box.bottom + 4)
        : side === "above"
          ? Math.max(
              8,
              Math.min(box.top - height - 4, innerHeight - height - 8),
            )
          : Math.max(8, Math.min(box.top, innerHeight - height - 8));
    appliedSize = { width, height };
    Object.assign(container.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`,
      minWidth: `${Math.min(240, innerWidth - left - 8)}px`,
      minHeight: `${Math.min(140, innerHeight - top - 8)}px`,
      maxWidth: `${Math.max(1, innerWidth - left - 8)}px`,
      maxHeight: `${Math.max(1, innerHeight - top - 8)}px`,
    });
  }
  return {
    show,
    close: closePopup,
    resize: sizePopup,
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
