import { wordStates } from "@/vocabulary/state";
import { z } from "zod";

export const wordStyleStates = [...wordStates, "ignored", "unparsed"] as const;

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
