import { languageCode } from "@/languages/codes";
import type { Request } from "@/languages/contracts";
import { browser } from "wxt/browser";

export const handleLanguages = execute;
async function execute(request: Request) {
  switch (request.action) {
    case "detectLanguage": {
      const result = await browser.i18n.detectLanguage(request.text);
      const top = [...result.languages].sort(
        (a, b) => b.percentage - a.percentage,
      )[0];
      return result.isReliable &&
        top &&
        top.percentage >= 80 &&
        top.language !== "und"
        ? languageCode(top.language)
        : null;
    }
  }
}
