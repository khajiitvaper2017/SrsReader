import type { SyncProgress, SyncRecord } from "@/sync/model";

export type SyncWork =
  | { action: "initialize" }
  | { action: "prepare"; replaceAccount: boolean }
  | { action: "unpack"; key: string; device: string; revision: number }
  | { action: "merge"; keys: string[] }
  | { action: "pack"; key: string; account: string }
  | { action: "rebuild" };

export type PackedSync = {
  id: string;
  device: string;
  revision: number;
  blob: Blob;
  media: Map<string, Blob>;
};

export type SyncWorkError = {
  message: string;
  code?: string;
  status?: number;
  temporary?: boolean;
  retryAfter?: number;
};

export function syncWorkError(error: unknown): SyncWorkError {
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error ? error : {}),
    ...(error instanceof TypeError ||
    (error instanceof Error && "temporary" in error && error.temporary === true)
      ? { temporary: true }
      : {}),
  };
}

export type SyncWorkMessage = {
  id: string;
  progress?: SyncProgress;
  media?: { hash: string; record: SyncRecord };
  error?: SyncWorkError;
  done?: boolean;
  cancelled?: boolean;
};
