import { Affix, Notification, Stack, getDefaultZIndex } from "@mantine/core";
import { useDebouncedValue, useTimeout } from "@mantine/hooks";
import { useEffect } from "react";
import type { ImportProgress } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import { TaskProgress } from "@/shared/ui/TaskProgress";

/** Floating action feedback. Use busyLabel for non-import work; keep field errors beside controls. */
export function TaskAlerts({
  busy = false,
  busyLabel,
  progress,
  error,
  notice,
  onDismissError,
  onDismissNotice,
}: {
  busy?: boolean;
  busyLabel?: string;
  progress?: ImportProgress;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
}) {
  const { start, clear } = useTimeout(onDismissNotice, 5000);
  const [delayedBusy] = useDebouncedValue(busy, 300);
  const showProgress = busy && (!!progress || delayedBusy);

  useEffect(() => {
    if (!busy && notice) start();
    return clear;
  }, [busy, notice, start, clear]);

  if (!showProgress && !error && (!notice || busy)) return null;
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
        {showProgress && (
          <Notification loading withCloseButton={false} role="status">
            {progress ? (
              <TaskProgress progress={progress} />
            ) : (
              busyLabel || t("working")
            )}
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
