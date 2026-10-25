import { cleanupDictionaryData } from "@/dictionaries/revisions";
import { setImmersionWeight } from "@/dictionaries/immersion";
import { broadcast, notify } from "@/background/events";
import type { Request } from "@/dictionaries/contracts";
import { meaningTags } from "@/dictionaries/model";
import { wordMatchesGrammar } from "@/dictionaries/grammar";
import { lookup } from "@/dictionaries/resolve";
import { searchDictionaries } from "@/dictionaries/search";
import {
  deleteDictionary,
  listDictionaries,
  reorderDictionary,
  setDictionaryDisplay,
} from "@/dictionaries/storage";
import { srsWrite } from "@/platform/locks";
import type { Settings } from "@/settings/model";
import { getSettings } from "@/settings/store";
import { stateOf } from "@/vocabulary/model";
import { getWords } from "@/vocabulary/storage";

export function handleDictionaries(request: Request, settings: Settings) {
  return request.action === "cleanupDictionaries" ||
    request.action === "setImmersionWeight" ||
    request.action === "setDictionary" ||
    request.action === "moveDictionary" ||
    request.action === "deleteDictionary"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "cleanupDictionaries":
      return cleanupDictionaryData();
    case "setImmersionWeight":
      await setImmersionWeight(request.language, request.weight);
      await broadcast({ event: "changed", scope: "frequency" });
      return;
    case "dictionaries":
      return listDictionaries(settings);
    case "searchDictionaries":
      return searchDictionaries(request);
    case "setDictionary":
      await setDictionaryDisplay(request, settings);
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
      settings = { ...settings, studyLanguage: request.language };
      const result = await lookup(
        request.term,
        settings,
        false,
        request.occurrence,
        request.localOnly,
      );
      const words = result.words.filter(
        (word) =>
          word.meanings.length && wordMatchesGrammar(word, result.grammar),
      );
      if (words.length) {
        const saved = await getWords(words.map((word) => word.id));
        await broadcast({
          ...(request.occurrence
            ? ({
                event: "parsedOccurrence",
                occurrence: request.occurrence,
              } as const)
            : ({ event: "parsed", term: request.term } as const)),
          language: settings.studyLanguage,
          candidates: words.map((word, index) => ({
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
