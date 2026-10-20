import { scanText } from "@/dictionaries/lookup";
import type { Request } from "@/reader/contracts";
import type { Settings } from "@/settings/model";

export const handleReader = execute;
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "scan":
      return settings.paused
        ? []
        : scanText(
            request.text,
            settings.studyLanguage,
            settings.matureIntervalDays,
          );
  }
}
