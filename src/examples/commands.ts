import type { Request } from "@/examples/contracts";
import { exampleCorpusInfo, wordExamples } from "@/examples/query";
import type { Settings } from "@/settings/model";

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
