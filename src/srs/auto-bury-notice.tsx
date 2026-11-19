import { notifications } from "@mantine/notifications";
import { CalendarClock } from "lucide-react";
import { t } from "@/shared/i18n/i18n";

export function notifyAutoBury(reviewId: string) {
  notifications.show({
    id: reviewId,
    icon: <CalendarClock aria-hidden size={16} />,
    title: t("card_auto_buried"),
    message: t("card_auto_buried_reason"),
    role: "status",
  });
}
