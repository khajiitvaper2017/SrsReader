import type { CollectionBase, SyncProgress } from "@/sync/model";

export type SyncWork =
  | {
      action: "capture";
      account: string;
      parents: string[];
      generation: number;
      mediaGeneration: number;
      includeMediaHashes: boolean;
    }
  | { action: "apply"; source: string; hash: string; base: CollectionBase }
  | { action: "media" }
  | { action: "rebuild" };

export type PackedSync = {
  id: string;
  account: string;
  parents: string[];
  generation: number;
  mediaGeneration: number;
  name: string;
  hash: string;
  blob: Blob;
};

export type SyncWorkError = {
  message: string;
  code?: string;
  status?: number;
  temporary?: boolean;
  retryAfter?: number;
};

export function isLargeValueReadError(error: unknown) {
  return (
    error instanceof Error &&
    error.name === "UnknownError" &&
    error.message.includes("Failed to read large IndexedDB value")
  );
}

export function syncWorkError(error: unknown): SyncWorkError {
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error ? error : {}),
    ...(error instanceof TypeError ||
    isLargeValueReadError(error) ||
    (error instanceof Error && "temporary" in error && error.temporary === true)
      ? { temporary: true }
      : {}),
  };
}

export type SyncWorkMessage = {
  id: string;
  progress?: SyncProgress;
  media?: string;
  error?: SyncWorkError;
  done?: boolean;
  cancelled?: boolean;
};
