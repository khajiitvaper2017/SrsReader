import { Affix, Notification, Stack, getDefaultZIndex } from "@mantine/core";
import type { ImportProgress } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import { TaskProgress } from "@/shared/ui/TaskProgress";

/** Floating feedback for page actions. Keep field errors and help beside their controls. */
export function TaskAlerts({
  busy = false,
  progress,
  error,
  notice,
  onDismissError,
  onDismissNotice,
}: {
  busy?: boolean;
  progress?: ImportProgress;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
}) {
  if (!busy && !error && !notice) return null;
  return (
    <Affix
      position={{
        bottom: "var(--mantine-spacing-md)",
        right: "var(--mantine-spacing-md)",
      }}
      zIndex={getDefaultZIndex("overlay")}
      w={400}
      maw="calc(100vw - 2 * var(--mantine-spacing-md))"
      data-srs-reader=""
    >
      <Stack gap="xs">
        {busy && (
          <Notification loading withCloseButton={false} role="status">
            {progress ? <TaskProgress progress={progress} /> : t("working")}
          </Notification>
        )}
        {error && (
          <Notification
            color="red"
            role="alert"
            onClose={onDismissError}
            closeButtonProps={{ "aria-label": t("dismiss_notification") }}
          >
            {error}
          </Notification>
        )}
        {!busy && notice && (
          <Notification
            color="green"
            role="status"
            onClose={onDismissNotice}
            closeButtonProps={{ "aria-label": t("dismiss_notification") }}
          >
            {notice}
          </Notification>
        )}
      </Stack>
    </Affix>
  );
}
