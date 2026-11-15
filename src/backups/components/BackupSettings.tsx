import {
  Alert,
  ActionIcon,
  Button,
  Divider,
  FileButton,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { exportLearning, exportSettings } from "@/backups/archive";
import { useBackups } from "@/backups/hooks/useBackups";
import type { SettingsTask } from "@/settings/hooks/useSettingsTask";
import type { Settings } from "@/settings/model";
import { downloadSize, t } from "@/shared/i18n/i18n";
import { useRef } from "react";
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
    </Stack>
  );
}
