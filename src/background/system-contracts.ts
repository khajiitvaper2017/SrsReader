import type { SyncStorage } from "@/sync/model";
import { z } from "zod";

export const resetCategories = ["reviews", "learning", "dictionaries"] as const;
export type ResetCategory = (typeof resetCategories)[number];

export const requests = [
  z.object({ action: z.literal("invalidate") }),
  z.object({
    action: z.literal("resetDrivePreview"),
    account: z.string().min(1),
  }),
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
  resetDrivePreview: SyncStorage;
  clearExtensionData: void;
  runImport: void;
  closeImportHost: void;
};
