import { z } from "zod";
import type { Settings } from "./model";

export const wordStates = [
  "unknown",
  "new",
  "learning",
  "review",
  "due",
  "known",
  "suspended",
] as const;
export type WordState = (typeof wordStates)[number];
export const wordStyleStates = [...wordStates, "ignored", "unparsed"] as const;
export const wordStateLabels = {
  unknown: "new",
  new: "saved",
  learning: "young",
  review: "mature",
  due: "due",
  known: "mastered",
  suspended: "suspended",
  ignored: "ignored",
  unparsed: "unparsed",
};
const styleSchema = z.object({
  mode: z.enum(["none", "text", "background"]),
  color: z.string().regex(/^#[\da-f]{6}$/i),
});
export const wordStylesSchema = z
  .object({
    unknown: styleSchema.default({ mode: "text", color: "#dc4c4c" }),
    new: styleSchema.default({ mode: "text", color: "#e57c45" }),
    learning: styleSchema.default({ mode: "text", color: "#d99a24" }),
    review: styleSchema.default({ mode: "text", color: "#299978" }),
    due: styleSchema.default({ mode: "background", color: "#d99a24" }),
    known: styleSchema.default({ mode: "none", color: "#40975c" }),
    suspended: styleSchema.default({ mode: "none", color: "#9298a4" }),
    ignored: styleSchema.default({ mode: "none", color: "#9298a4" }),
    unparsed: styleSchema.default({ mode: "none", color: "#9298a4" }),
  })
  .prefault({});

export function wordHighlightCss(settings: Settings) {
  return (
    wordStyleStates
      .map((state) => {
        const { mode, color } = settings.wordStyles[state];
        const enabled = settings.wordColorsEnabled;
        return `::highlight(srs-${state}){color:${enabled && mode === "text" ? color : "inherit"};background-color:${enabled && mode === "background" ? color + "30" : "transparent"}}`;
      })
      .join("\n") +
    "\n::highlight(srs-focus){background-color:#a78bfa60;color:inherit}"
  );
}
