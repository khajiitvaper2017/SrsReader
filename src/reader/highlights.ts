import { wordHighlightCss } from "@/reader/highlight-style";
import type { ReaderConfiguration as Settings } from "@/reader/types";
import { wordStyleStates } from "@/settings/word-styles";
import type { WordState } from "@/vocabulary/state";

export function createHighlights(settings: Settings) {
  const highlights = new Map<WordState | "ignored" | "unparsed", Highlight>();
  const style = document.createElement("style");
  style.dataset.srsReader = "";
  style.textContent = wordHighlightCss(settings);
  document.documentElement.append(style);
  for (const state of wordStyleStates) {
    const highlight = new Highlight();
    highlights.set(state, highlight);
    CSS.highlights.set("srs-" + state, highlight);
  }
  const focus = new Highlight();
  CSS.highlights.set("srs-focus", focus);
  return {
    get: (state: WordState | "ignored" | "unparsed") => highlights.get(state)!,
    values: () => highlights.values(),
    focus: (range: Range) => focus.add(range),
    clearFocus: () => focus.clear(),
    configure: (value: Settings) => {
      style.textContent = wordHighlightCss(value);
    },
    dispose: () => {
      style.remove();
      for (const state of highlights.keys())
        CSS.highlights.delete("srs-" + state);
      CSS.highlights.delete("srs-focus");
    },
  };
}
export type ReaderHighlights = ReturnType<typeof createHighlights>;
