import { z } from "zod";

export const resetCategories = [
  "reviews",
  "vocabulary",
  "cards",
  "dictionaries",
] as const;
export type ResetCategory = (typeof resetCategories)[number];

export const requests = [
  z.object({ action: z.literal("invalidate") }),
  z.object({
    action: z.literal("resetExtension"),
    account: z.string().min(1).nullable(),
  }),
  z.object({
    action: z.literal("clearExtensionData"),
    category: z.enum(resetCategories),
  }),
  z.object({ action: z.literal("runImport") }),
  z.object({ action: z.literal("closeImportHost") }),
] as const;
export type Responses = {
  invalidate: void;
  resetExtension: void;
  clearExtensionData: void;
  runImport: void;
  closeImportHost: void;
};
