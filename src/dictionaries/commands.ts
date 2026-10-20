import { broadcast, notify } from "@/background/events";
import type { Request } from "@/dictionaries/contracts";
import { meaningTags } from "@/dictionaries/model";
import { lookup } from "@/dictionaries/resolve";
import {
  deleteDictionary,
  listDictionaries,
  reorderDictionary,
  setDictionaryEnabled,
} from "@/dictionaries/storage";
import { srsWrite } from "@/platform/locks";
import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { stateOf } from "@/vocabulary/model";
import { getWords } from "@/vocabulary/storage";

export function handleDictionaries(request: Request, settings: Settings) {
  return request.action === "setDictionary" ||
    request.action === "moveDictionary" ||
    request.action === "deleteDictionary"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "dictionaries":
      return listDictionaries();
    case "setDictionary":
      await setDictionaryEnabled(request, settings);
      await notify(undefined, "dictionaries");
      return;
    case "moveDictionary":
      await reorderDictionary(request, settings);
      await notify(undefined, "dictionaries");
      return;
    case "deleteDictionary":
      await deleteDictionary(request);
      await notify(undefined, "dictionaries");
      return;
    case "lookup": {
      const result = await lookup(
        request.term,
        settings,
        false,
        request.occurrence,
      );
      if (result.words.length && !request.occurrence) {
        const saved = await getWords(result.words.map((word) => word.id));
        await broadcast({
          event: "parsed",
          term: request.term,
          language: settings.studyLanguage,
          candidates: result.words.map((word, index) => ({
            id: word.id,
            tags: word.meanings.flatMap(meaningTags),
            state: stateOf(saved[index], settings.matureIntervalDays),
          })),
        });
      }
      return result;
    }
  }
}
