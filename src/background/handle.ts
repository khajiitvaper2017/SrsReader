import type { ScanWarning } from "@/platform/messaging/events";
import { handleAudio } from "@/audio/commands";
import type { Request } from "@/background/contracts";
import { notify } from "@/background/events";
import { handleDictionaries } from "@/dictionaries/commands";
import { handleExamples } from "@/examples/commands";
import { handleLanguages } from "@/languages/commands";
import { handleLookup } from "@/lookup/commands";
import { handleReader } from "@/reader/commands";
import { handleSettings } from "@/settings/commands";
import { getSettings } from "@/settings/store";
import { handleSrs } from "@/srs/commands";
import { handleVocabulary } from "@/vocabulary/commands";
import { handleImports } from "@/imports/commands";

export async function handle(request: Request, warn?: ScanWarning) {
  const settings = await getSettings();
  switch (request.action) {
    case "runImport":
    case "closeImportHost":
      return handleImports(request.action);
    case "settings":
    case "setSettings":
      return handleSettings(request, settings);
    case "cleanupDictionaries":
    case "dictionaries":
    case "searchDictionaries":
    case "germanCompoundParts":
    case "setDictionary":
    case "moveDictionary":
    case "deleteDictionary":
    case "lookup":
      return handleDictionaries(request, settings);
    case "scan":
      return handleReader(request, settings, warn);
    case "detectLanguage":
      return handleLanguages(request);
    case "examples":
    case "exampleCorpus":
      return handleExamples(request);
    case "createSession":
    case "session":
    case "closeLookup":
    case "compoundGrammar":
      return handleLookup(request);
    case "selectReadingCard":
    case "word":
    case "cardDefinitions":
    case "saveCardFields":
    case "saveCustomTranslation":
    case "saveTranslation":
    case "mine":
    case "defineWord":
    case "deleteDefinition":
    case "restoreDefinition":
    case "dictionaryVisibility":
    case "known":
    case "suspend":
    case "deleteWord":
    case "refreshWord":
    case "words":
    case "retentionOverride":
      return handleVocabulary(request, settings);
    case "grade":
    case "undo":
    case "queue":
    case "studyOverview":
    case "manageDeck":
    case "createFrequencyDeck":
    case "sentenceExamples":
    case "preview":
    case "stats":
    case "reviewStats":
    case "resetRwkv":
    case "rwkvStatus":
    case "prepareRwkv":
    case "activateAlgorithm":
    case "rescheduleModel":
    case "reschedule":
      return handleSrs(request, settings);
    case "audio":
    case "audioSources":
    case "setAudioSources":
      return handleAudio(request, settings);
    case "invalidate":
      await notify();
      return;
  }
  request satisfies never;
}
