import { useEffect, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Anchor,
  Button,
  Group,
  Modal,
  Menu,
  Radio,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { downloadSize, i18n, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { TaskProgress } from "@/shared/ui/TaskProgress";
import { useSync } from "@/sync/hooks/useSync";
import { MoreHorizontal, RefreshCw } from "lucide-react";

export function SyncSettings() {
  const sync = useSync({ refreshStorageOnMount: true });
  const { status, operation, loading, canceling, error } = sync;
  const [replaceAccount, setReplaceAccount] = useState(false);
  const [dismissed, setDismissed] = useState<string>();
  const [selected, setSelected] = useState("");
  const choice = status?.choice;
  useEffect(() => setSelected(""), [choice?.token]);
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
  const errorMessage =
    error &&
    !(status?.authorizationRequired && errorKey === "sync_auth_required")
      ? errorKey && i18n.exists(errorKey)
        ? t(errorKey)
        : t("sync_error_detail", { detail: error })
      : "";

  return (
    <>
      <Stack gap="sm">
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
            {status.authorizationRequired && !busy && (
              <Text variant="supporting">{t("sync_auth_required")}</Text>
            )}
            <Switch
              label={t("sync_automatic")}
              labelPosition="left"
              styles={{
                body: { width: "100%", minHeight: 44, alignItems: "center" },
                labelWrapper: { flex: 1 },
                track: { flexShrink: 0 },
              }}
              description={t("sync_automatic_help")}
              checked={status.automatic}
              disabled={!status.connected || !status.configured || busy}
              onChange={(event) =>
                void sync.setAutomatic(event.currentTarget.checked)
              }
            />
            <Stack gap={4} aria-live="polite" role="status">
              <Text variant="supporting">
                {t(
                  status.pending ? "sync_local_pending" : "sync_local_current",
                )}
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
            {status.mediaPending && (
              <Text variant="supporting" role="status">
                {t("sync_media_pending")}
              </Text>
            )}
            {status.connected && (
              <Accordion>
                <Accordion.Item value="storage">
                  <Accordion.Control>{t("sync_storage")}</Accordion.Control>
                  <Accordion.Panel>
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
                            operation === "storage" ||
                            progress?.phase === "storage"
                          }
                          disabled={busy || loading}
                          onClick={() => void sync.refreshStorage()}
                        >
                          <RefreshCw aria-hidden size={16} />
                        </ActionIcon>
                      </Group>
                      {status.storage && (
                        <Text variant="supporting">
                          {t("sync_storage_files", {
                            count: status.storage.files,
                          })}
                          {" · "}
                          {t("sync_storage_checked", {
                            time: new Date(
                              status.storage.updated,
                            ).toLocaleString(i18n.resolvedLanguage, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }),
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
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
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
                  unit: progress?.unit,
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
          {(!status?.connected || status.authorizationRequired) && (
            <Button
              disabled={!canConnect}
              loading={operation === "connect"}
              onClick={() => void sync.connect()}
            >
              {t(
                status?.authorizationRequired
                  ? "sync_reconnect"
                  : "sync_connect",
              )}
            </Button>
          )}
          <Button
            variant="default"
            disabled={
              !status?.connected || !status.configured || busy || loading
            }
            onClick={() =>
              choice ? setDismissed(undefined) : void sync.syncNow()
            }
          >
            {t(choice ? "sync_choose_copy" : "sync_now")}
          </Button>
          {status?.account && (
            <Menu>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  aria-label={t("actions")}
                  disabled={busy || loading}
                  loading={operation === "disconnect"}
                >
                  <MoreHorizontal aria-hidden size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  disabled={!canConnect}
                  onClick={() => setReplaceAccount(true)}
                >
                  {t("sync_change_account")}
                </Menu.Item>
                <Menu.Item
                  disabled={busy || loading}
                  onClick={() => void sync.disconnect()}
                >
                  {t("sync_disconnect")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
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
      {choice && (
        <Modal
          opened={choice.token !== dismissed && !replaceAccount}
          onClose={() => setDismissed(choice.token)}
          title={t(
            choice.kind === "upgrade"
              ? "sync_upgrade_title"
              : "sync_choose_copy",
          )}
          withCloseButton={false}
          centered
          data-srs-reader
        >
          <Stack gap="sm">
            <Text variant="supporting">
              {t(
                choice.kind === "upgrade"
                  ? choice.canUpload
                    ? "sync_upgrade_help"
                    : "sync_upgrade_empty"
                  : "sync_choice_help",
              )}
            </Text>
            {choice.copies.length > 1 && (
              <Radio.Group
                value={selected}
                onChange={setSelected}
                label={t("sync_drive_copies")}
              >
                <Stack gap="xs" mt="xs">
                  {choice.copies.map((copy, index) => (
                    <Radio
                      key={copy.id}
                      value={copy.id}
                      label={t("sync_copy_label", {
                        count: index + 1,
                        time: copy.created
                          ? new Date(copy.created).toLocaleString(
                              i18n.resolvedLanguage,
                            )
                          : t("sync_unknown_time"),
                      })}
                    />
                  ))}
                </Stack>
              </Radio.Group>
            )}
            <Group gap="xs" wrap="wrap">
              <Button
                variant="default"
                data-autofocus
                onClick={() => setDismissed(choice.token)}
              >
                {t("sync_cancel")}
              </Button>
              {choice.canUpload && (
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() =>
                    void sync.syncNow({ token: choice.token, keep: "local" })
                  }
                >
                  {t("sync_upload_device")}
                </Button>
              )}
              {choice.copies.length > 0 && (
                <Button
                  variant="default"
                  disabled={busy || (choice.copies.length > 1 && !selected)}
                  onClick={() =>
                    void sync.syncNow({
                      token: choice.token,
                      keep:
                        choice.copies.length === 1
                          ? choice.copies[0]!.id
                          : selected,
                    })
                  }
                >
                  {t("sync_download_drive")}
                </Button>
              )}
            </Group>
          </Stack>
        </Modal>
      )}
      <Modal
        opened={replaceAccount}
        onClose={() => setReplaceAccount(false)}
        title={t("sync_change_account_title")}
        closeButtonProps={{ "aria-label": t("sync_cancel"), size: "xl" }}
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
    </>
  );
}
