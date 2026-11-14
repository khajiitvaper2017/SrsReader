import { wordStates } from "@/vocabulary/state";
import { z } from "zod";

export const wordStyleStates = [...wordStates, "ignored", "unparsed"] as const;

const styleSchema = z.object({
  // Read existing saved settings and sync snapshots as background tints.
  mode: z.preprocess(
    (mode) => (mode === "text" ? "background" : mode),
    z.enum(["none", "background", "underline", "dotted-underline"]),
  ),
  color: z.string().regex(/^#[\da-f]{6}$/i),
});

export const wordStylesSchema = z
  .object({
    unknown: styleSchema.default({ mode: "background", color: "#e07070" }),
    new: styleSchema.default({ mode: "background", color: "#e57c45" }),
    learning: styleSchema.default({ mode: "background", color: "#d99a24" }),
    review: styleSchema.default({ mode: "none", color: "#299978" }),
    due: styleSchema.default({ mode: "background", color: "#9d73d9" }),
    known: styleSchema.default({ mode: "none", color: "#40975c" }),
    suspended: styleSchema.default({ mode: "none", color: "#9298a4" }),
    ignored: styleSchema.default({ mode: "none", color: "#9298a4" }),
    unparsed: styleSchema.default({ mode: "none", color: "#9298a4" }),
  })
  .prefault({});
