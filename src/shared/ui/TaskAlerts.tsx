import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useEffect, useEffectEvent, useId } from "react";
import type { ImportProgress } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import { TaskProgress } from "@/shared/ui/TaskProgress";

function useTaskResult(
  message: string,
  color: "red" | "green",
  onDismiss: () => void,
) {
  const id = useId();
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    if (!message) return;
    let active = true;
    notifications.show({
      id,
      message,
      color,
      role: color === "red" ? "alert" : "status",
      onClose: () => {
        if (active) dismiss();
      },
    });
    return () => {
      active = false;
      notifications.hide(id);
    };
  }, [id, message, color]);
}

/** Sends task state to the shared notification stack. */
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
  const id = useId();
  const [delayedBusy] = useDebouncedValue(busy, 300);
  const showProgress = busy && (!!progress || delayedBusy);
  useEffect(() => {
    if (!showProgress) {
      notifications.hide(id);
      return;
    }
    const notification = {
      id,
      message: progress ? (
        <TaskProgress progress={progress} />
      ) : (
        busyLabel || t("working")
      ),
      loading: true,
      autoClose: false as const,
      allowClose: false,
      role: "status",
    };
    notifications.show(notification);
    notifications.update(notification);
  }, [id, showProgress, progress, busyLabel]);
  useEffect(
    () => () => {
      notifications.hide(id);
    },
    [id],
  );

  useTaskResult(error, "red", onDismissError);
  useTaskResult(busy ? "" : notice, "green", onDismissNotice);
  return null;
}
