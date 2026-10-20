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
export async function handle(request: Request) {
  const settings = await getSettings();
  switch (request.action) {
    case "settings":
    case "setSettings":
      return handleSettings(request, settings);
    case "dictionaries":
    case "setDictionary":
    case "moveDictionary":
    case "deleteDictionary":
    case "lookup":
      return handleDictionaries(request, settings);
    case "scan":
      return handleReader(request, settings);
    case "detectLanguage":
      return handleLanguages(request);
    case "examples":
    case "exampleCorpus":
      return handleExamples(request, settings);
    case "createSession":
    case "session":
    case "closeLookup":
    case "resizeLookup":
      return handleLookup(request);
    case "word":
    case "saveTranslation":
    case "mine":
    case "defineWord":
    case "deleteDefinition":
    case "known":
    case "suspend":
    case "deleteWord":
    case "editWord":
    case "refreshWord":
    case "words":
    case "retentionOverride":
      return handleVocabulary(request, settings);
    case "grade":
    case "undo":
    case "queue":
    case "preview":
    case "stats":
    case "resetRwkv":
    case "rwkvStatus":
    case "prepareRwkv":
    case "activateAlgorithm":
    case "reschedule":
      return handleSrs(request, settings);
    case "audio":
    case "audioSources":
      return handleAudio(request, settings);
    case "invalidate":
      await notify();
      return;
  }
}
