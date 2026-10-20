import { cacheAudio } from "@/audio/cache";
import { notify } from "@/background/events";
import { resolved } from "@/dictionaries/resolve";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import type { Settings } from "@/settings/model";
import { getSettings, saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import type { Request } from "@/srs/contracts";
import { invalidateRwkv, replayBatch, rwkvStatus } from "@/srs/rwkv/runtime";
import {
  dailyCounts,
  grade,
  preview,
  rescheduleExisting,
  reviewQueue,
  undoReview,
} from "@/srs/service";
import { stateOf } from "@/vocabulary/model";
import { snapshot } from "@/vocabulary/snapshot";
import type { Grade } from "ts-fsrs";

export function handleSrs(request: Request, settings: Settings) {
  return request.action === "grade" ||
    request.action === "undo" ||
    request.action === "preview" ||
    request.action === "resetRwkv" ||
    request.action === "prepareRwkv" ||
    request.action === "activateAlgorithm" ||
    request.action === "reschedule"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "grade": {
      const word = await snapshot(await resolved(request.term, request.id));
      const result = await grade(
        word,
        request.rating as Grade,
        request.source,
        request.version,
        request.context,
        request.durationMs,
        request.time,
      );
      cacheAudio(word);
      await notify(word.id);
      return result;
    }
    case "undo":
      await notify(await undoReview(request.id));
      return;
    case "queue":
      return reviewQueue();
    case "preview":
      return preview(
        await db.vocabulary.get(request.id),
        request.durationMs,
        request.id,
      );
    case "stats": {
      const words = await db.vocabulary
        .where("language")
        .equals(settings.studyLanguage)
        .toArray();
      return {
        total: words.length,
        known: words.filter((w) => w.known).length,
        due: words.filter(
          (w) => stateOf(w, settings.matureIntervalDays) === "due",
        ).length,
        today: (await dailyCounts(settings)).today,
      };
    }
    case "resetRwkv":
      await invalidateRwkv();
      await db.srsMeta.update("main", { undo: undefined });
      return;
    case "rwkvStatus":
      return rwkvStatus(settings);
    case "prepareRwkv":
      return replayBatch(settings);
    case "activateAlgorithm": {
      if (request.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
        throw new Error(t("rwkv_not_ready"));
      const value = { ...settings, algorithm: request.algorithm };
      await saveSettings(value);
      await notify();
      return value;
    }
    case "reschedule": {
      const result = await rescheduleExisting(request.after);
      await notify();
      return result;
    }
  }
}
