import type { Request } from "@/sync/contracts";
import {
  automaticSync,
  cancelSync,
  connectSync,
  disconnectSync,
  refreshSyncStorage,
  scheduleEdits,
  setAutomaticSync,
  syncNow,
  syncStatus,
} from "@/sync/service";

export async function handleSync(request: Request) {
  switch (request.action) {
    case "syncConnect":
      void connectSync(request.replaceAccount).catch(console.warn);
      break;
    case "syncCancel":
      await cancelSync();
      break;
    case "syncDisconnect":
      await disconnectSync();
      break;
    case "syncNow":
      void syncNow().catch(console.warn);
      break;
    case "syncAutomatic":
      await setAutomaticSync(request.enabled);
      break;
    case "syncAppOpened":
    case "syncOnline":
      void automaticSync().catch(console.warn);
      break;
    case "syncEdited":
      await scheduleEdits();
      break;
    case "syncStorage":
      void refreshSyncStorage().catch(console.warn);
      break;
    case "syncStatus":
      break;
  }
  return syncStatus();
}
