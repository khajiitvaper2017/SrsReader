import type { ReaderPreferences as Settings } from "@/reader/preferences";
import { wordStyleStates } from "@/settings/word-styles";

export function wordTintColor(color: string, opacity: number) {
  return `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
}

export function wordHighlightCss(settings: Settings) {
  return (
    wordStyleStates
      .map((state) => {
        const { mode, color } = settings.wordStyles[state];
        const enabled = settings.wordColorsEnabled;
        const underline =
          enabled && (mode === "underline" || mode === "dotted-underline");
        return `::highlight(srs-${state}){background-color:${enabled && mode === "background" ? wordTintColor(color, settings.wordColorOpacity) : "transparent"};text-decoration:${underline ? `underline ${mode === "dotted-underline" ? "dotted" : "solid"} ${color}` : "none"}}\n[data-srs-reader-no-color]::highlight(srs-${state}){background-color:transparent;text-decoration:none}`;
      })
      .join("\n") + "\n::highlight(srs-focus){background-color:#a78bfa60}"
  );
}
