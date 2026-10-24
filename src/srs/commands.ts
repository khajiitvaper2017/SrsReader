import { cacheAudio } from "@/audio/cache";
import { notify } from "@/background/events";
import { resolved } from "@/dictionaries/resolve";
import { srsWrite } from "@/platform/locks";
import type { Settings } from "@/settings/model";
import { getSettings, saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { preview } from "@/srs/answers";
import type { Request } from "@/srs/contracts";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { replayBatch } from "@/srs/engines/rwkv/replay";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { grade } from "@/srs/grading";
import { reviewQueue } from "@/srs/queue";
import {
  requireScheduledModel,
  rescheduleExisting,
  rescheduleModel,
} from "@/srs/reschedule";
import { reviewStatistics } from "@/srs/statistics";
import { clearUndo } from "@/srs/storage";
import { undoReview } from "@/srs/undo";
import { dailyCounts } from "@/srs/workload";
import { stateOf } from "@/vocabulary/model";
import { snapshot } from "@/vocabulary/snapshot";
import { getWord, languageWords } from "@/vocabulary/storage";
import type { Grade } from "ts-fsrs";
import {
  createFrequencyDeck,
  manageStudyDeck,
  studyOverview,
} from "@/srs/decks";
import { sentenceExamples } from "@/examples/sentences";

export function handleSrs(request: Request, settings: Settings) {
  return request.action === "createFrequencyDeck" ||
    request.action === "manageDeck" ||
    request.action === "grade" ||
    request.action === "undo" ||
    request.action === "preview" ||
    request.action === "resetRwkv" ||
    request.action === "prepareRwkv" ||
    request.action === "activateAlgorithm" ||
    request.action === "rescheduleModel" ||
    request.action === "reschedule"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  if (["queue", "preview", "grade"].includes(request.action))
    await requireScheduledModel(settings);
  switch (request.action) {
    case "studyOverview":
      return studyOverview(settings);
    case "manageDeck":
      await manageStudyDeck(
        request.language,
        request.deckId,
        request.operation,
      );
      await notify(undefined, "collection");
      return;
    case "createFrequencyDeck": {
      const deck = await createFrequencyDeck(
        request.dictionaryId,
        request.limit,
        request.name,
      );
      await notify(undefined, "collection");
      return deck;
    }
    case "sentenceExamples": {
      const word = await getWord(request.id);
      return word ? sentenceExamples(word, settings) : [];
    }
    case "grade": {
      const word = {
        forms: [],
        ...((await getWord(request.id)) ??
          (await snapshot(
            await resolved(request.term, request.id, request.occurrence),
          ))),
      };
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
      await notify(word.id, request.source === "review" ? "srs" : "vocabulary");
      return result;
    }
    case "undo":
      await notify(await undoReview(request.id));
      return;
    case "queue":
      return reviewQueue(request.language, request.deckId);
    case "preview":
      return preview(await getWord(request.id), request.durationMs, request.id);
    case "reviewStats":
      return reviewStatistics(
        { ...settings, studyLanguage: request.language },
        request.year,
      );
    case "stats": {
      const words = (
        await Promise.all(settings.studyLanguages.map(languageWords))
      ).flat();
      return {
        total: words.length,
        known: words.filter((w) => w.known).length,
        due: words.filter(
          (w) => stateOf(w, settings.matureIntervalDays) === "due",
        ).length,
        today: (
          await Promise.all(
            settings.studyLanguages.map((language) =>
              dailyCounts({ ...settings, studyLanguage: language }),
            ),
          )
        ).reduce((sum, counts) => sum + counts.today, 0),
      };
    }
    case "resetRwkv":
      await invalidateRwkv();
      await clearUndo();
      return;
    case "rwkvStatus":
      return rwkvStatus(settings);
    case "prepareRwkv":
      return replayBatch(settings);
    case "activateAlgorithm": {
      if (request.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
        throw new Error(t("rwkv_not_ready"));
      const value = {
        ...settings,
        algorithm: request.algorithm,
        rwkvMode: request.rwkvMode ?? settings.rwkvMode,
      };
      await saveSettings(value);
      await notify(undefined, "settings");
      return value;
    }
    case "rescheduleModel": {
      const result = await rescheduleModel();
      if (result.cursor === null) await notify(undefined, "srs");
      return result;
    }
    case "reschedule": {
      const result = await rescheduleExisting(
        request.after,
        false,
        request.language,
      );
      await notify(undefined, "srs");
      return result;
    }
  }
}
