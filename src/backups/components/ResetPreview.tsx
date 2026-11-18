import { List, Stack, Text } from "@mantine/core";
import type { ResetCategory } from "@/background/system-contracts";
import { learningResetTables } from "@/backups/reset-scope";
import { db } from "@/platform/database/db";
import { rpc } from "@/platform/messaging/send";
import { downloadSize, number, t } from "@/shared/i18n/i18n";
import type { SyncStorage } from "@/sync/model";
import { useEffect, useState } from "react";

const tables = {
  reviews: ["reviews", "ankiReviews"],
  learning: learningResetTables,
  dictionaries: ["dictionaries"],
  all: [...learningResetTables, "decks", "dictionaries"],
} as const;

export function ResetPreview({
  category,
  accountId,
  storageUsage,
}: {
  category: "all" | ResetCategory;
  accountId?: string;
  storageUsage?: number | null;
}) {
  const [counts, setCounts] = useState<
    { table: string; count: number }[] | null
  >();
  const [drive, setDrive] = useState<SyncStorage | null>();
  useEffect(() => {
    let active = true;
    const names = tables[category];
    void db
      .transaction(
        "r",
        names.map((name) => db[name]),
        async () =>
          Promise.all(
            names.map(async (table) => ({
              table,
              count: await db[table].count(),
            })),
          ),
      )
      .then((values) => {
        if (active) setCounts(values);
      })
      .catch(() => {
        if (active) setCounts(null);
      });
    if (accountId)
      void rpc({ action: "resetDrivePreview", account: accountId })
        .then((result) => {
          if (active) setDrive(result);
        })
        .catch(() => {
          if (active) setDrive(null);
        });
    return () => {
      active = false;
    };
  }, [category, accountId]);

  return (
    <Stack gap="xs" role="status" aria-live="polite">
      {counts ? (
        <List size="sm">
          {counts.map(({ table, count }) => (
            <List.Item key={table}>
              {t(`reset_preview_${table}`, { total: number(count) })}
            </List.Item>
          ))}
        </List>
      ) : (
        <Text variant="supporting">
          {t(
            counts === undefined
              ? "reset_preview_loading"
              : "reset_preview_unavailable",
          )}
        </Text>
      )}
      {category === "all" && typeof storageUsage === "number" && (
        <Text variant="supporting">
          {t("reset_preview_local_size", { size: downloadSize(storageUsage) })}
        </Text>
      )}
      {accountId && (
        <Text variant="supporting">
          {drive
            ? t("reset_preview_drive_files", { total: number(drive.files) })
            : t(
                drive === undefined
                  ? "reset_preview_drive_loading"
                  : "reset_preview_drive_unavailable",
              )}
          {drive?.bytes != null && (
            <>
              {" "}
              ·{" "}
              {t("reset_preview_drive_size", {
                size: downloadSize(drive.bytes),
              })}
            </>
          )}
        </Text>
      )}
    </Stack>
  );
}
