import {
  Alert,
  Button,
  Divider,
  FileButton,
  Group,
  Paper,
  SimpleGrid,
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
    <Paper>
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
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Stack gap="sm">
            <Title order={3}>{t("full_backup")}</Title>
            <Text variant="supporting">{t("full_backup_description")}</Text>
            <Stack gap="xs" mt="auto">
              <Button
                disabled={busy}
                variant="default"
                onClick={() => void fullExport()}
              >
                <Download aria-hidden="true" size={16} />{" "}
                {t("full_backup_export")}
              </Button>
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
                  <Button {...props} disabled={busy}>
                    <Upload aria-hidden="true" size={16} />{" "}
                    {t("full_backup_import")}
                  </Button>
                )}
              </FileButton>
            </Stack>
          </Stack>
          <Stack gap="sm">
            <Title order={3}>{t("settings")}</Title>
            <Text variant="supporting">{t("settings_backup_description")}</Text>
            <Stack gap="xs" mt="auto">
              <Button
                disabled={busy}
                onClick={() => void task(exportSettings)}
                variant="default"
              >
                <Download aria-hidden="true" size={16} />{" "}
                {t("export_json")}{" "}
              </Button>
              <FileButton
                accept=".json"
                disabled={busy}
                onChange={(importedFile) => {
                  void fileImport(importedFile ?? undefined, "settings");
                }}
              >
                {(props) => (
                  <Button {...props} disabled={busy}>
                    <Upload aria-hidden="true" size={16} />{" "}
                    {t("import_json")}{" "}
                  </Button>
                )}
              </FileButton>
            </Stack>
          </Stack>
          <Stack gap="sm">
            <Title order={3}>{t("words_progress")}</Title>
            <Text variant="supporting">
              {t("includes_sentences_review_history_and_saved_audio")}
            </Text>
            <Stack gap="xs" mt="auto">
              <Button
                disabled={busy}
                onClick={() => void task(exportLearning)}
                variant="default"
              >
                <Download aria-hidden="true" size={16} /> {t("export_zip")}{" "}
              </Button>
              <FileButton
                accept=".zip"
                disabled={busy}
                onChange={(importedFile) => {
                  void fileImport(importedFile ?? undefined, "learning");
                }}
              >
                {(props) => (
                  <Button {...props} disabled={busy}>
                    <Upload aria-hidden="true" size={16} />{" "}
                    {t("import_zip")}{" "}
                  </Button>
                )}
              </FileButton>
            </Stack>
          </Stack>
        </SimpleGrid>
        <Text variant="supporting">{t("full_backup_limits")}</Text>
        <Divider />
        <Stack gap="sm">
          <Title order={3}>{t("cleanup_title")}</Title>
          <Text variant="supporting">{t("cleanup_description")}</Text>
          <Group>
            <Button
              variant="default"
              disabled={busy}
              onClick={() => void cleanup()}
            >
              <Eraser aria-hidden="true" size={16} /> {t("cleanup_database")}
            </Button>
          </Group>
        </Stack>
        <Alert color="yellow">
          {t("imports_replace_the_selected_category_export_your_progress")}
        </Alert>
      </Stack>
    </Paper>
  );
}
