import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("invalidate") }),
] as const;
export type Responses = { invalidate: void };
