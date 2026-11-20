import type { AudioRecord } from "@/audio/model";
import type { CardAsset } from "@/cards/model";

export type SyncMeta = { id: string; [key: string]: unknown };
export type MediaTable = "audio" | "cardAssets";
export const mediaKey = (table: MediaTable, id: string) =>
  JSON.stringify([table, id]);
export type MediaItem = {
  hash: string;
  bytes: number;
  mime: string;
} & (
  | { table: "audio"; data: Omit<AudioRecord, "blob"> }
  | { table: "cardAssets"; data: Omit<CardAsset, "blob"> }
);
export type MediaIndexRow = {
  key: string;
  table: MediaTable;
  id: string;
  generation?: number;
  item?: MediaItem;
  hash?: string;
  missing?: 1;
};
export type SyncChoice = {
  token: string;
  kind: "conflict" | "upgrade";
  canUpload: boolean;
  copies: { id: string; created?: string }[];
};
export type CollectionBase = {
  id: "collection-base";
  account: string;
  file: string;
  generation: number;
  mediaGeneration: number;
};
export type SyncDecision = { token: string; keep: string };

export type SyncAccount = { id: string; email: string };
export type SyncProgress = {
  phase:
    | "check"
    | "download"
    | "download_media"
    | "prepare"
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
  choice: SyncChoice | null;
  mediaPending: boolean;
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
  storage: SyncStorage | null;
};
