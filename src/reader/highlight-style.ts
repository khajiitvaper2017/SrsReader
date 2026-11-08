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
        return `::highlight(srs-${state}){background-color:${enabled && mode === "background" ? wordTintColor(color, settings.wordColorOpacity) : "transparent"}}\n[data-srs-reader-no-color]::highlight(srs-${state}){background-color:transparent}`;
      })
      .join("\n") + "\n::highlight(srs-focus){background-color:#a78bfa60}"
  );
}
