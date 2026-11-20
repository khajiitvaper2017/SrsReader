import type { SyncProgress, SyncScope } from "@/sync/model";

export type SyncWork =
  | { action: "initialize" }
  | { action: "prepare"; replaceAccount: boolean }
  | {
      action: "unpack";
      key: string;
      source: string;
      device: string;
      revision: number;
      scope: SyncScope;
    }
  | { action: "merge"; keys: string[]; scope: SyncScope }
  | { action: "pack"; account: string; scope: SyncScope }
  | { action: "rebuild" };

export type PackedSync = {
  id: string;
  account: string;
  device: string;
  revision: number;
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
