import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("invalidate") }),
  z.object({ action: z.literal("runImport") }),
  z.object({ action: z.literal("closeImportHost") }),
] as const;
export type Responses = {
  invalidate: void;
  runImport: void;
  closeImportHost: void;
};
