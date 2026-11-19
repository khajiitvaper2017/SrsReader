import { z } from "zod";

export const syncKinds = [
  "vocabulary",
  "notes",
  "noteTypes",
  "cards",
  "schedules",
  "reviews",
  "ankiReviews",
  "decks",
  "sentences",
  "settings",
  "cardAssets",
  "audio",
] as const;
export const vectorSchema = z.record(
  z.string(),
  z.number().int().nonnegative(),
);
export type SyncVector = z.infer<typeof vectorSchema>;
export const syncRecordSchema = z.object({
  key: z.string(),
  kind: z.enum(syncKinds),
  id: z.string(),
  device: z.string().min(1),
  counter: z.number().int().positive(),
  observed: vectorSchema,
  time: z.number().finite(),
  deleted: z.boolean(),
  value: z.record(z.string(), z.unknown()).nullable(),
});
export type SyncRecord = z.infer<typeof syncRecordSchema>;
export type SyncKind = SyncRecord["kind"];
export const recordKey = (kind: SyncKind, id: string) =>
  JSON.stringify([kind, id]);

export const snapshotSchema = z.object({
  format: z.literal("srs-reader-sync"),
  version: z.literal(1),
  device: z.string().min(1),
  revision: z.number().int().positive(),
  observed: vectorSchema,
  records: z.array(syncRecordSchema),
  dependencies: z.array(syncRecordSchema).default([]),
});
export type SyncSnapshot = z.infer<typeof snapshotSchema>;
export type SyncIdentity = {
  id: "identity";
  device: string;
  counter: number;
  observed: SyncVector;
  published: number;
};
export type SyncMeta =
  | SyncIdentity
  | {
      id: string;
      [key: string]: unknown;
    };
export type SyncAccount = { id: string; email: string };
export type SyncProgress = {
  phase:
    | "check"
    | "download"
    | "download_media"
    | "prepare"
    | "merge"
    | "apply"
    | "rebuild"
    | "media"
    | "upload"
    | "storage";
  done: number;
  total: number;
  unit?: "bytes";
};
export type SyncStorage = {
  bytes: number | null;
  files: number;
  updated: number;
};
export type SyncStatus = {
  configured: boolean;
  connected: boolean;
  account: SyncAccount | null;
  automatic: boolean;
  lastSuccess: number | null;
  pending: number;
  progress: SyncProgress | null;
  error: string | null;
  authorizationRequired: boolean;
  running: boolean;
  storage: SyncStorage | null;
};
export type SyncTransferState = {
  account: string | null;
  automatic: boolean;
  lastSuccess: number | null;
  error: string | null;
  authorizationRequired: boolean;
  failures: number;
  retryAt: number;
  received: Record<string, number>;
  storage: SyncStorage | null;
};
