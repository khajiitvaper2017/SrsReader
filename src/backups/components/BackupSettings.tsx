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
import { Download, Upload } from "lucide-react";
export function BackupSettings({
  setSettings,
  tasks,
}: {
  setSettings: (settings: Settings) => void;
  tasks: SettingsTask;
}) {
  const { busy, task, fileImport } = useBackups({ setSettings, tasks });
  return (
    <Paper>
      <Stack>
        <Title order={2}>{t("import_export")}</Title>
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
        <Alert color="yellow">
          {t("imports_replace_the_selected_category_export_your_progress")}
        </Alert>
      </Stack>
    </Paper>
  );
}
