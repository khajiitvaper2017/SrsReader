import type { Request } from "@/examples/contracts";
import { exampleCorpusInfo, wordExamples } from "@/examples/query";

export const handleExamples = execute;
async function execute(request: Request) {
  switch (request.action) {
    case "examples":
      return wordExamples(request.lemma, request.language, request.surface);
    case "exampleCorpus":
      return exampleCorpusInfo(request.language);
  }
}
