import { z } from "zod";

export const requests = [
  z.object({
    action: z.literal("detectLanguage"),
    texts: z.array(z.string().max(6000)),
  }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = { detectLanguage: (string | null)[] };
