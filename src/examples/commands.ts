import type { Request } from "@/examples/contracts";
import { exampleCorpusInfo } from "@/examples/query";
import { queryExamples } from "@/imports/commands";

export const handleExamples = execute;
async function execute(request: Request) {
  switch (request.action) {
    case "examples":
      return (await exampleCorpusInfo(request.language)).installed
        ? queryExamples(request)
        : { installed: false, examples: [] };
    case "exampleCorpus":
      return exampleCorpusInfo(request.language);
  }
}
