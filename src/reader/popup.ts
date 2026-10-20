import { lookupClient } from "@/lookup/client";
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
  let popupRange: Range | undefined;
  let popupSession: string | undefined;
  let popupReady = false;
  function closePopup() {
    popup?.remove();
    popup = undefined;
    popupRange = undefined;
    popupSession = undefined;
    popupReady = false;
    highlights.clearFocus();
  }
  async function show(term: string, range: Range, context: ReadingContext) {
    if (
      popupRange &&
      popupRange.compareBoundaryPoints(Range.START_TO_START, range) === 0
    )
      return;
    closePopup();
    if (options.onLookup) {
      options.onLookup(term, context);
      return;
    }
    popupRange = range;
    const session = await lookupClient({
      action: "createSession",
      term,
      context,
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
      position: "fixed",
      boxSizing: "border-box",
      border: "1px solid #8884",
      borderRadius: "5px",
      boxShadow: "0 5px 20px #0002",
      zIndex: "2147483647",
      colorScheme:
        getSettings().theme === "system" ? "light dark" : getSettings().theme,
      background: "Canvas",
    });
    sizePopup(180);
    document.documentElement.append(popup);
    highlights.focus(range);
  }
  function sizePopup(requestedHeight: number) {
    if (!popup || !popupRange) return;
    const box = popupRange.getBoundingClientRect();
    const width = Math.max(1, Math.min(360, innerWidth - 16));
    const height = Math.max(
      1,
      Math.min(Math.max(140, requestedHeight), 460, innerHeight - 16),
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
    Object.assign(popup.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`,
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
