import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("detectLanguage"),
    texts: z.array(z.string().max(6000)),
  }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type Responses = { detectLanguage: (string | null)[] };
