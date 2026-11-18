import {
  Alert,
  ActionIcon,
  Button,
  Divider,
  FileButton,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { exportLearning, exportSettings } from "@/backups/archive";
import { ResetPreview } from "@/backups/components/ResetPreview";
import { useBackups } from "@/backups/hooks/useBackups";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import {
  resetCategories,
  type ResetCategory,
} from "@/background/system-contracts";
import { rpc } from "@/platform/messaging/send";
import type { SyncAccount } from "@/sync/model";
import { downloadSize, i18n, t } from "@/shared/i18n/i18n";
import { useRef, useState } from "react";
import { Download, Upload, Eraser } from "lucide-react";
export function BackupSettings({
  setSettings,
  tasks,
}: {
  setSettings: (settings: Settings) => void;
  tasks: SettingsTask;
}) {
  const { busy, storageUsage, task, fileImport, fullExport, cleanup } =
    useBackups({
      setSettings,
      tasks,
    });
  const resetFullInput = useRef<() => void>(null);
  const [resetTarget, setResetTarget] = useState<
    | { category: "all"; account: SyncAccount | null }
    | { category: ResetCategory }
  >();
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const resetLabel =
    resetTarget &&
    (resetTarget.category === "all"
      ? t("reset_extension")
      : t(`reset_data_${resetTarget.category}`));
  async function confirmReset(category: "all" | ResetCategory) {
    setResetError("");
    setResetComplete(false);
    if (category !== "all") {
      setResetTarget({ category });
      return;
    }
    setResetBusy(true);
    try {
      const { account } = await rpc({ action: "syncStatus" });
      setResetTarget({ category, account });
    } catch (error) {
      setResetError((error as Error).message);
    } finally {
      setResetBusy(false);
    }
  }

  async function reset() {
    if (!resetTarget) return;
    setResetError("");
    setResetBusy(true);
    try {
      if (resetTarget.category === "all") {
        await rpc({
          action: "resetExtension",
          account: resetTarget.account?.id ?? null,
        });
        localStorage.clear();
        sessionStorage.clear();
        location.hash = "setup";
        location.reload();
      } else {
        await rpc({
          action: "clearExtensionData",
          category: resetTarget.category,
        });
        if (resetTarget.category !== "dictionaries")
          sessionStorage.removeItem("last-review");
        setResetTarget(undefined);
        setResetComplete(true);
      }
    } catch (error) {
      const message = (error as Error).message;
      const key = message.toLowerCase();
      setResetError(i18n.exists(key) ? t(key) : message);
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Title order={2}>{t("import_export")}</Title>
        <Text fw={500} role="status" aria-live="polite">
          {storageUsage === undefined
            ? t("storage_usage_loading")
            : storageUsage === null
              ? t("storage_usage_unavailable")
              : t("browser_storage_used", {
                  size: downloadSize(storageUsage),
                })}
        </Text>
      </Group>
      <Stack gap="md">
        <Stack gap="xs">
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Title order={3}>{t("full_backup")}</Title>
            <Group gap="xs" wrap="nowrap">
              <ActionIcon
                disabled={busy}
                variant="default"
                aria-label={t("full_backup_export")}
                title={t("full_backup_export")}
                onClick={() => void fullExport()}
              >
                <Download aria-hidden="true" size={16} />
              </ActionIcon>
              <FileButton
                accept=".zip"
                resetRef={resetFullInput}
                disabled={busy}
                onChange={(file) => {
                  void fileImport(file ?? undefined, "full").finally(() =>
                    resetFullInput.current?.(),
                  );
                }}
              >
                {(props) => (
                  <ActionIcon
                    {...props}
                    disabled={busy}
                    variant="default"
                    aria-label={t("full_backup_import")}
                    title={t("full_backup_import")}
                  >
                    <Upload aria-hidden="true" size={16} />
                  </ActionIcon>
                )}
              </FileButton>
            </Group>
          </Group>
          <Text variant="supporting">{t("full_backup_description")}</Text>
        </Stack>
        <Stack gap="xs">
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Title order={3}>{t("settings")}</Title>
            <Group gap="xs" wrap="nowrap">
              <ActionIcon
                disabled={busy}
                variant="default"
                aria-label={t("export_json")}
                title={t("export_json")}
                onClick={() => void task(exportSettings)}
              >
                <Download aria-hidden="true" size={16} />
              </ActionIcon>
              <FileButton
                accept=".json"
                disabled={busy}
                onChange={(importedFile) => {
                  void fileImport(importedFile ?? undefined, "settings");
                }}
              >
                {(props) => (
                  <ActionIcon
                    {...props}
                    disabled={busy}
                    variant="default"
                    aria-label={t("import_json")}
                    title={t("import_json")}
                  >
                    <Upload aria-hidden="true" size={16} />
                  </ActionIcon>
                )}
              </FileButton>
            </Group>
          </Group>
          <Text variant="supporting">{t("settings_backup_description")}</Text>
        </Stack>
        <Stack gap="xs">
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Title order={3}>{t("words_progress")}</Title>
            <Group gap="xs" wrap="nowrap">
              <ActionIcon
                disabled={busy}
                variant="default"
                aria-label={t("export_zip")}
                title={t("export_zip")}
                onClick={() => void task(exportLearning)}
              >
                <Download aria-hidden="true" size={16} />
              </ActionIcon>
              <FileButton
                accept=".zip"
                disabled={busy}
                onChange={(importedFile) => {
                  void fileImport(importedFile ?? undefined, "learning");
                }}
              >
                {(props) => (
                  <ActionIcon
                    {...props}
                    disabled={busy}
                    variant="default"
                    aria-label={t("import_zip")}
                    title={t("import_zip")}
                  >
                    <Upload aria-hidden="true" size={16} />
                  </ActionIcon>
                )}
              </FileButton>
            </Group>
          </Group>
          <Text variant="supporting">
            {t("includes_sentences_review_history_and_saved_audio")}
          </Text>
        </Stack>
      </Stack>
      <Text variant="supporting">{t("full_backup_limits")}</Text>
      <Divider />
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Title order={3}>{t("cleanup_title")}</Title>
          <Button
            variant="default"
            disabled={busy}
            onClick={() => void cleanup()}
          >
            <Eraser aria-hidden="true" size={16} /> {t("cleanup_database")}
          </Button>
        </Group>
        <Text variant="supporting">{t("cleanup_description")}</Text>
      </Stack>
      <Alert color="yellow">
        {t("imports_replace_the_selected_category_export_your_progress")}
      </Alert>
      <Divider />
      <Stack gap="xs">
        <Title order={3}>{t("reset_data_title")}</Title>
        <Group gap="xs">
          {resetCategories.map((category) => (
            <Button
              key={category}
              color="red"
              variant="light"
              disabled={busy || resetBusy}
              onClick={() => void confirmReset(category)}
            >
              {t(`reset_data_${category}`)}
            </Button>
          ))}
          <Button
            color="red"
            variant="light"
            disabled={busy}
            loading={resetBusy && !resetTarget}
            onClick={() => void confirmReset("all")}
          >
            {t("reset_extension")}
          </Button>
        </Group>
        {resetComplete && (
          <Alert role="status">{t("reset_data_complete")}</Alert>
        )}
      </Stack>
      {!resetTarget && <ErrorBox error={resetError} />}
      <Modal
        opened={!!resetTarget}
        onClose={() => {
          if (!resetBusy) setResetTarget(undefined);
        }}
        title={resetLabel}
        centered
        withCloseButton={false}
        closeOnEscape={!resetBusy}
        closeOnClickOutside={!resetBusy}
      >
        <Stack>
          {resetTarget?.category === "all" ? (
            <>
              <Text>{t("reset_extension_confirm")}</Text>
              {resetTarget.account && (
                <Text>
                  {t("reset_extension_drive_confirm", {
                    email: resetTarget.account.email,
                  })}
                </Text>
              )}
            </>
          ) : (
            resetTarget && (
              <>
                <Text>{t(`reset_data_${resetTarget.category}_confirm`)}</Text>
                {resetTarget.category !== "dictionaries" && (
                  <Text variant="supporting">
                    {t("reset_data_sync_notice")}
                  </Text>
                )}
              </>
            )
          )}
          {resetTarget && (
            <ResetPreview
              category={resetTarget.category}
              accountId={
                resetTarget.category === "all"
                  ? resetTarget.account?.id
                  : undefined
              }
              storageUsage={storageUsage}
            />
          )}
          <ErrorBox error={resetError} />
          <Group justify="flex-end">
            <Button
              variant="default"
              data-autofocus
              disabled={resetBusy}
              onClick={() => setResetTarget(undefined)}
            >
              {t("cancel")}
            </Button>
            <Button
              color="red"
              loading={resetBusy}
              onClick={() => void reset()}
            >
              {resetLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
