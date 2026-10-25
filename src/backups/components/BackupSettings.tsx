import {
  Alert,
  Button,
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
import { t } from "@/shared/i18n/i18n";
import { useRef } from "react";
import { Download, Upload, Eraser } from "lucide-react";
export function BackupSettings({
  setSettings,
  tasks,
}: {
  setSettings: (settings: Settings) => void;
  tasks: SettingsTask;
}) {
  const { busy, task, fileImport, fullExport, cleanup } = useBackups({
    setSettings,
    tasks,
  });
  const resetFullInput = useRef<() => void>(null);
  return (
    <Paper>
      <Stack>
        <Title order={2}>{t("import_export")}</Title>
        <Stack>
          <Title order={3}>{t("full_backup")}</Title>
          <Text variant="supporting">{t("full_backup_description")}</Text>
          <Text variant="supporting">{t("full_backup_limits")}</Text>
          <Group>
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
          </Group>
        </Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Stack>
            <Title order={3}>{t("settings")}</Title>
            <Group align="center">
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
            </Group>
          </Stack>
          <Stack>
            <Title order={3}>{t("words_progress")}</Title>
            <Text>
              {t("includes_sentences_review_history_and_saved_audio")}
            </Text>
            <Group align="center">
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
            </Group>
          </Stack>
        </SimpleGrid>
        <Stack>
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
