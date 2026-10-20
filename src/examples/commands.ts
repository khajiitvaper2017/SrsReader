import type { Request } from "@/examples/contracts";
import type { Settings } from "@/settings/model";
import { exampleCorpusInfo, wordExamples } from "@/vocabulary/examples/query";

export const handleExamples = execute;
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "examples":
      return wordExamples(
        request.lemma,
        settings.studyLanguage,
        request.surface,
      );
    case "exampleCorpus":
      return exampleCorpusInfo(settings.studyLanguage);
  }
}
