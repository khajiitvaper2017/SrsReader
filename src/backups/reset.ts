import { notify } from "@/background/events";
import type { ResetCategory } from "@/background/system-contracts";
import { clearInstalledDictionaries } from "@/dictionaries/revisions";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { t } from "@/shared/i18n/i18n";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { emptySchedule } from "@/srs/model";
import { deleteLearningRecords } from "@/sync/tracking";

export function clearExtensionData(category: ResetCategory) {
  return srsWrite(async () => {
    if ((await db.importTasks.get("current"))?.status === "running")
      throw new Error(t("reset_extension_import_busy"));
    if (category === "dictionaries") {
      await clearInstalledDictionaries();
      await notify(undefined, "dictionaries");
      return;
    }
    await db.transaction("rw", db.tables, async () => {
      if (category === "learning") await deleteLearningRecords();
      else {
        const now = Date.now();
        await db.reviews.clear();
        await db.ankiReviews.clear();
        await db.cards
          .filter((card) => !!card.schedule?.state || card.leech)
          .modify((card) => {
            if (card.schedule) card.schedule = emptySchedule(now);
            if (card.leech) card.suspended = false;
            card.leech = false;
            card.srsVersion++;
            card.version++;
            card.updated = now;
          });
      }
      await db.srsMeta.update("main", {
        sequence: 0,
        undo: undefined,
        reschedule: undefined,
        fsrsMigration: undefined,
      });
      await invalidateRwkv();
    });
    await notify();
  });
}
