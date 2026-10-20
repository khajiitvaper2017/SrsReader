import { languagesClient } from "@/languages/client";
import { languageCode } from "@/languages/codes";
import type { Detector } from "@/platform/browser-ai";
import { ai } from "@/platform/browser-ai";

let detector: Promise<Detector> | undefined;

export async function detectLanguage(text: string): Promise<string | null> {
  const sample = text.trim().slice(0, 6000);
  if (sample.length < 120) return null;
  if (ai.LanguageDetector) {
    try {
      // Downloading a model needs a click; automatic parsing must not require one.
      if ((await ai.LanguageDetector.availability()) === "available") {
        detector ??= ai.LanguageDetector.create();
        const [top] = await (await detector).detect(sample);
        if (top && top.confidence >= 0.8 && top.detectedLanguage !== "und")
          return languageCode(top.detectedLanguage);
      }
    } catch {
      detector = undefined;
    }
  }
  return languagesClient({ action: "detectLanguage", text: sample }).catch(
    () => null,
  );
}
