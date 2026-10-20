import type { Settings } from "@/settings/model";
import { wordStyleStates } from "@/settings/word-styles";

export function wordHighlightCss(settings: Settings) {
  return (
    wordStyleStates
      .map((state) => {
        const { mode, color } = settings.wordStyles[state];
        const enabled = settings.wordColorsEnabled;
        return `::highlight(srs-${state}){color:${enabled && mode === "text" ? color : "inherit"};background-color:${enabled && mode === "background" ? color + "30" : "transparent"}}`;
      })
      .join("\n") + "\n::highlight(srs-focus){background-color:#a78bfa60}"
  );
}
