import type { ParsingRule } from "@/languages/parsing-rules/types";

export const czechRules = {
  imperfectiveToPerfective: {
    pattern:
      /^(\p{L}{2,}č)(?:ovat|oval[aoiy]?|ován[aoiy]?|uje(?:š|me|te)?|uj(?:i|u|í|ou|me|te)?)$/u,
    replacement: "$1it",
    forms: ["cs-imperfective"],
    verbOnly: true,
    perfectiveOnly: true,
  },
  stripPerfectivePrefix: {
    pattern: /^z(\p{L}{2,})$/u,
    replacement: "$1",
    forms: ["z-"],
    verbOnly: true,
  },
} satisfies Record<string, ParsingRule>;
