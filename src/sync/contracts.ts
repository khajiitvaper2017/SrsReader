import { z } from "zod";
import type { SyncStatus } from "@/sync/model";

export const reviewSyncLock = "srs-reader-active-review";

export const requests = [
  z.object({ action: z.literal("syncStatus") }),
  z.object({ action: z.literal("syncStorage") }),
  z.object({
    action: z.literal("syncConnect"),
    replaceAccount: z.boolean().optional(),
  }),
  z.object({ action: z.literal("syncCancel") }),
  z.object({ action: z.literal("syncDisconnect") }),
  z.object({
    action: z.literal("syncNow"),
    decision: z
      .object({ token: z.string(), keep: z.string().min(1) })
      .optional(),
  }),
  z.object({ action: z.literal("syncAutomatic"), enabled: z.boolean() }),
  z.object({ action: z.literal("syncAppOpened") }),
  z.object({ action: z.literal("syncReviewEnded") }),
  z.object({ action: z.literal("syncOnline") }),
  z.object({ action: z.literal("syncEdited") }),
] as const;
export type Request = z.infer<(typeof requests)[number]>;
export type Responses = { [Action in Request["action"]]: SyncStatus };
