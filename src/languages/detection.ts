import { languagesClient } from "@/languages/client";
import { languageCode } from "@/languages/codes";
import type { Detector } from "@/platform/browser-ai";
import { ai } from "@/platform/browser-ai";
import { guessLanguage } from "@/languages/guess";

let detector: Promise<Detector> | undefined;
const cache = new Map<string, string | null>();

// Synchronous lookup uses the same guesses as scanning, without waiting for IPC.
export function knownLanguage(text: string) {
  const sample = languageSample(text);
  const language = cache.get(sample) || guessLanguage(sample);
  if (language) {
    cache.set(sample, language);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
  return language;
}

export function languageSample(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 6000) return trimmed;
  const middle = Math.floor(trimmed.length / 2);
  return [
    trimmed.slice(0, 1998),
    trimmed.slice(middle - 999, middle + 999),
    trimmed.slice(-1998),
  ].join("\n");
}

export function languageTag(element: Element) {
  const marked = element.closest("[lang],[data-reading-language]");
  const tag =
    marked?.getAttribute("data-reading-language") ||
    marked?.getAttribute("lang");
  if (!tag) return null;
  try {
    return languageCode(tag);
  } catch {
    return null;
  }
}

export async function detectLanguages(
  texts: string[],
): Promise<(string | null)[]> {
  const samples = texts.map(languageSample);
  for (const sample of new Set(samples)) {
    if (cache.has(sample)) continue;
    const guess = guessLanguage(sample);
    if (guess) cache.set(sample, guess);
  }
  const missing = [
    ...new Set(
      samples.filter((sample) => sample.length >= 40 && !cache.has(sample)),
    ),
  ];
  if (missing.length) {
    let local: Detector | undefined;
    try {
      // Automatic scanning must not download a model or require a user gesture.
      if (
        ai.LanguageDetector &&
        (await ai.LanguageDetector.availability()) === "available"
      ) {
        detector ??= ai.LanguageDetector.create();
        local = await detector;
      }
    } catch {
      detector = undefined;
    }
    const fallback: string[] = [];
    for (const sample of missing) {
      try {
        const [top] = (await local?.detect(sample)) || [];
        if (top && top.confidence >= 0.8 && top.detectedLanguage !== "und") {
          cache.set(sample, languageCode(top.detectedLanguage));
          continue;
        }
      } catch {
        detector = undefined;
      }
      fallback.push(sample);
    }
    if (fallback.length) {
      const results = await languagesClient({
        action: "detectLanguage",
        texts: fallback,
      }).catch(() => []);
      for (const [index, sample] of fallback.entries())
        cache.set(sample, results[index] ?? null);
    }
  }
  const results = samples.map((sample) => cache.get(sample) ?? null);
  while (cache.size > 500) cache.delete(cache.keys().next().value!);
  return results;
}
