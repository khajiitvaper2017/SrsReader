import { useEffect, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { downloadSize, i18n, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { TaskProgress } from "@/shared/ui/TaskProgress";
import { useSync } from "@/sync/hooks/useSync";
import { RefreshCw } from "lucide-react";

export function SyncSettings() {
  const sync = useSync({ refreshStorageOnMount: true });
  const { status, operation, loading, canceling, error } = sync;
  const [replaceAccount, setReplaceAccount] = useState(false);
  const errorKey = error?.toLowerCase();
  const accountChanged = errorKey === "sync_account_changed";
  const cancelled =
    errorKey === "sync_cancelled" || errorKey === "sync_auth_cancelled";
  useEffect(() => {
    if (accountChanged) setReplaceAccount(true);
  }, [accountChanged]);
  const busy = !!operation || !!status?.running || canceling;
  const canConnect = !!status?.configured && !busy && !loading;
  const progress = status?.progress;
  const progressLabel = progress
    ? t(`sync_progress_${progress.phase}`)
    : t(
        operation === "connect"
          ? "sync_connecting"
          : operation === "storage"
            ? "sync_progress_storage"
            : "sync_in_progress",
      );
  const errorMessage = error
    ? errorKey && i18n.exists(errorKey)
      ? t(errorKey)
      : t("sync_error_detail", { detail: error })
    : "";

  return (
    <Paper>
      <Stack gap="sm">
        <Title order={2}>{t("sync_title")}</Title>
        <Text variant="supporting">{t("sync_help")}</Text>
        {loading && (
          <Text variant="supporting" role="status" aria-live="polite">
            {t("sync_loading")}
          </Text>
        )}
        {status && (
          <>
            {!status.configured && (
              <Text variant="supporting">{t("sync_not_configured_help")}</Text>
            )}
            <Text style={{ overflowWrap: "anywhere" }}>
              {status.connected && status.account
                ? t("sync_connected_account", { email: status.account.email })
                : status.account
                  ? t("sync_disconnected_account", {
                      email: status.account.email,
                    })
                  : t("sync_not_connected")}
            </Text>
            {status.authorizationRequired && (
              <Text variant="supporting">{t("sync_auth_required")}</Text>
            )}
            <Switch
              label={t("sync_automatic")}
              description={t("sync_automatic_help")}
              checked={status.automatic}
              disabled={!status.connected || !status.configured || busy}
              onChange={(event) =>
                void sync.setAutomatic(event.currentTarget.checked)
              }
            />
            <Stack gap={4} aria-live="polite" role="status">
              <Text variant="supporting">
                {t("sync_pending", { count: status.pending })}
              </Text>
              <Text variant="supporting">
                {status.lastSuccess
                  ? t("sync_last_success", {
                      time: new Date(status.lastSuccess).toLocaleString(
                        i18n.resolvedLanguage,
                        { dateStyle: "medium", timeStyle: "short" },
                      ),
                    })
                  : t("sync_never_synced")}
              </Text>
            </Stack>
            {status.connected && (
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text fw={500} role="status" aria-live="polite">
                    {status.storage
                      ? status.storage.bytes === null
                        ? t("sync_storage_unavailable")
                        : t("sync_storage_used", {
                            size: downloadSize(status.storage.bytes),
                          })
                      : t("sync_storage_not_checked")}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    aria-label={t("sync_storage_refresh")}
                    title={t("sync_storage_refresh")}
                    loading={
                      operation === "storage" || progress?.phase === "storage"
                    }
                    disabled={busy || loading}
                    onClick={() => void sync.refreshStorage()}
                  >
                    <RefreshCw aria-hidden size={16} />
                  </ActionIcon>
                </Group>
                {status.storage && (
                  <Text variant="supporting">
                    {t("sync_storage_files", { count: status.storage.files })}
                    {" · "}
                    {t("sync_storage_checked", {
                      time: new Date(status.storage.updated).toLocaleString(
                        i18n.resolvedLanguage,
                        {
                          dateStyle: "medium",
                          timeStyle: "short",
                        },
                      ),
                    })}
                  </Text>
                )}
                <Text variant="supporting">{t("sync_storage_help")}</Text>
                <Text variant="supporting">
                  {t("sync_storage_hidden_help")}{" "}
                  <Anchor
                    href="https://drive.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("sync_open_drive")}
                  </Anchor>
                </Text>
              </Stack>
            )}
            {(status.running ||
              operation === "connect" ||
              operation === "sync" ||
              operation === "storage") && (
              <TaskProgress
                progress={{
                  phase: progressLabel,
                  done: progress?.done ?? 0,
                  total: progress?.total ?? 0,
                }}
              />
            )}
          </>
        )}
        {cancelled ? (
          <Text variant="supporting" role="status" aria-live="polite">
            {errorMessage}
          </Text>
        ) : (
          <ErrorBox error={errorMessage} />
        )}
        <Group gap="xs" wrap="wrap">
          <Button
            disabled={!canConnect}
            loading={operation === "connect"}
            onClick={() => {
              if (status?.connected && !status.authorizationRequired)
                setReplaceAccount(true);
              else void sync.connect();
            }}
          >
            {t(
              status?.authorizationRequired
                ? "sync_reconnect"
                : status?.connected
                  ? "sync_change_account"
                  : "sync_connect",
            )}
          </Button>
          <Button
            variant="default"
            disabled={
              !status?.connected || !status.configured || busy || loading
            }
            onClick={() => void sync.syncNow()}
          >
            {t("sync_now")}
          </Button>
          {status?.account && (
            <Button
              variant="subtle"
              disabled={busy || loading}
              loading={operation === "disconnect"}
              onClick={() => void sync.disconnect()}
            >
              {t("sync_disconnect")}
            </Button>
          )}
          {(status?.running ||
            operation === "connect" ||
            operation === "sync" ||
            operation === "storage") && (
            <Button
              variant="default"
              loading={canceling}
              onClick={() => void sync.cancel()}
            >
              {t("sync_cancel")}
            </Button>
          )}
          {!status && !loading && (
            <Button variant="default" onClick={() => void sync.refresh()}>
              {t("sync_retry")}
            </Button>
          )}
        </Group>
        {status?.account && (
          <Text variant="supporting">{t("sync_disconnect_help")}</Text>
        )}
      </Stack>
      <Modal
        opened={replaceAccount}
        onClose={() => setReplaceAccount(false)}
        title={t("sync_change_account_title")}
        closeButtonProps={{ "aria-label": t("sync_cancel") }}
        centered
        data-srs-reader
      >
        <Stack>
          <Text variant="supporting">{t("sync_change_account_help")}</Text>
          <Group gap="xs" wrap="wrap">
            <Button
              variant="default"
              data-autofocus
              onClick={() => setReplaceAccount(false)}
            >
              {t("sync_cancel")}
            </Button>
            <Button
              disabled={!canConnect}
              onClick={() => {
                setReplaceAccount(false);
                void sync.connect(true);
              }}
            >
              {t("sync_change_account_confirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
