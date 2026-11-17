import { cleanupDictionaryData } from "@/dictionaries/revisions";
import { broadcast, notify } from "@/background/events";
import type { Request } from "@/dictionaries/contracts";
import { meaningTags } from "@/dictionaries/model";
import { wordMatchesGrammar } from "@/dictionaries/grammar";
import { lookupGermanCompoundParts } from "@/dictionaries/lookup";
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
import { stateOf } from "@/vocabulary/state";
import { getWords } from "@/vocabulary/storage";
import { cardEncounterKey, grammarFeatures } from "@/cards/encounter-key";

export function handleDictionaries(request: Request, settings: Settings) {
  return request.action === "cleanupDictionaries" ||
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
    case "dictionaries":
      return listDictionaries(settings);
    case "germanCompoundParts":
      return lookupGermanCompoundParts(request.term);
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
      const words = result.words.filter((word) =>
        wordMatchesGrammar(word, result.grammar),
      );
      if (words.length) {
        const encounterKey = cardEncounterKey({
          context: { surface: request.term, language: request.language },
          ...(result.grammar
            ? grammarFeatures(result.grammar)
            : { pos: "", feats: {} }),
        });
        void getWords(words.map((word) => word.id))
          .then((saved) => {
            const candidates = words.flatMap((word, index) =>
              word.meanings.length || saved[index]?.linkedCards.length
                ? [
                    {
                      id: word.id,
                      tags: word.meanings.flatMap(meaningTags),
                      state: stateOf(
                        saved[index],
                        settings.matureIntervalDays,
                        encounterKey,
                      ),
                    },
                  ]
                : [],
            );
            if (candidates.length)
              return broadcast({
                ...(request.occurrence
                  ? ({
                      event: "parsedOccurrence",
                      occurrence: request.occurrence,
                    } as const)
                  : ({ event: "parsed", term: request.term } as const)),
                language: settings.studyLanguage,
                encounterKey,
                candidates,
              });
          })
          .catch(console.warn);
      }
      return result;
    }
  }
}
