import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { RpcError } from "@/platform/messaging/send";
import { useChanges } from "@/shared/hooks/useChanges";
import { syncClient } from "@/sync/client";
import type { Request } from "@/sync/contracts";
import type { SyncStatus } from "@/sync/model";

type Operation = "connect" | "disconnect" | "sync" | "automatic" | "storage";

export function useSyncLifecycle() {
  useEffect(() => {
    function trigger(action: "syncAppOpened" | "syncOnline") {
      void syncClient({ action }).catch((error: unknown) => {
        console.warn("[sync] lifecycle request failed", error);
      });
    }
    trigger("syncAppOpened");
    const online = () => trigger("syncOnline");
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
}

export function useSync({ refreshStorageOnMount = false } = {}) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const active = useRef(false);
  const revision = useRef(0);
  const command = useRef(0);
  const storageAccount = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const next = await syncClient({ action: "syncStatus" });
      if (mounted.current && current === revision.current) {
        setStatus(next);
        setRefreshError(null);
      }
    } catch (failure) {
      if (mounted.current && current === revision.current)
        setRefreshError(
          failure instanceof Error ? failure.message : "sync_error",
        );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, [refresh]);
  useChanges(refresh, ["sync"]);

  const execute = useCallback(
    async (nextOperation: Operation, request: Request) => {
      if (active.current) return false;
      active.current = true;
      const current = ++command.current;
      setOperation(nextOperation);
      setError(null);
      try {
        if (
          request.action === "syncConnect" &&
          import.meta.env.BROWSER === "firefox"
        ) {
          const permission: Parameters<
            typeof browser.permissions.request
          >[0] & {
            data_collection: string[];
          } = {
            data_collection: [
              "authenticationInfo",
              "personallyIdentifyingInfo",
              "websiteContent",
            ],
          };
          const granted = await browser.permissions.request(permission);
          if (current !== command.current) return false;
          if (!granted)
            throw new RpcError(
              "sync_permission_required",
              "SYNC_PERMISSION_REQUIRED",
            );
        }
        const next = await syncClient(request);
        if (mounted.current && current === command.current) {
          revision.current += 1;
          setStatus(next);
        }
        return !next.error;
      } catch (failure) {
        if (mounted.current && current === command.current)
          setError(
            failure instanceof RpcError
              ? failure.code || failure.message
              : failure instanceof Error
                ? failure.message
                : "sync_error",
          );
        return false;
      } finally {
        if (current === command.current) {
          active.current = false;
          if (mounted.current) setOperation(null);
        }
      }
    },
    [],
  );
  const account = status?.account?.id ?? null;
  useEffect(() => {
    if (!refreshStorageOnMount) return;
    if (!account) {
      storageAccount.current = null;
      return;
    }
    if (status?.running || operation || storageAccount.current === account)
      return;
    storageAccount.current = account;
    void execute("storage", { action: "syncStorage" });
  }, [refreshStorageOnMount, account, status?.running, operation, execute]);

  async function cancel() {
    if (canceling) return;
    setCanceling(true);
    setError(null);
    try {
      const next = await syncClient({ action: "syncCancel" });
      command.current += 1;
      revision.current += 1;
      active.current = false;
      if (mounted.current) {
        setStatus(next);
        setOperation(null);
      }
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "sync_error");
    } finally {
      if (mounted.current) setCanceling(false);
    }
  }

  return {
    status,
    error: error || refreshError || status?.error || null,
    operation,
    loading,
    canceling,
    refresh,
    connect: (replaceAccount = false) =>
      execute("connect", { action: "syncConnect", replaceAccount }),
    disconnect: () => execute("disconnect", { action: "syncDisconnect" }),
    syncNow: () => execute("sync", { action: "syncNow" }),
    setAutomatic: (enabled: boolean) =>
      execute("automatic", { action: "syncAutomatic", enabled }),
    refreshStorage: () => execute("storage", { action: "syncStorage" }),
    cancel,
  };
}
