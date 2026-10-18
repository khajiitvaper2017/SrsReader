import { browser } from "wxt/browser";
import { rpc } from "./api";

type Availability =
  "unavailable" | "downloadable" | "downloading" | "available";
type Monitor = {
  addEventListener(
    type: "downloadprogress",
    listener: (event: { loaded: number }) => void,
  ): void;
};
type TranslatorOptions = {
  sourceLanguage: string;
  targetLanguage: string;
  monitor?: (monitor: Monitor) => void;
};
type Detector = {
  detect(
    text: string,
  ): Promise<{ detectedLanguage: string; confidence: number }[]>;
};
const ai = globalThis as typeof globalThis & {
  Translator?: {
    availability(options: TranslatorOptions): Promise<Availability>;
    create(options: TranslatorOptions): Promise<{
      translate(text: string): Promise<string>;
      destroy(): void;
    }>;
  };
  LanguageDetector?: {
    availability(): Promise<Availability>;
    create(): Promise<Detector>;
  };
};

export const translationLanguages = ai.Translator
  ? [
      "ar",
      "bg",
      "bn",
      "cs",
      "da",
      "de",
      "el",
      "en",
      "es",
      "et",
      "fa",
      "fi",
      "fr",
      "he",
      "hi",
      "hr",
      "hu",
      "id",
      "it",
      "ja",
      "ko",
      "lt",
      "mr",
      "ms",
      "nl",
      "no",
      "pl",
      "pt",
      "ro",
      "ru",
      "sk",
      "sl",
      "sv",
      "ta",
      "te",
      "th",
      "tr",
      "uk",
      "vi",
      "zh",
    ]
  : ["bg", "cs", "de", "en", "es", "et", "fr", "it", "pt", "ru", "uk"];

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
          return top.detectedLanguage.split("-")[0]!;
      }
    } catch {
      detector = undefined;
    }
  }
  return rpc({ action: "detectLanguage", text: sample }).catch(() => null);
}

type TranslationRequest = {
  from: string;
  to: string;
  text: string;
  html: false;
};
type Bergamot = {
  translate(request: TranslationRequest): Promise<{ target: { text: string } }>;
  delete(): Promise<void>;
};
type Backing = {
  fetch(
    url: string,
    checksum: string,
    options?: { signal?: AbortSignal },
  ): Promise<ArrayBuffer>;
};
type BergamotModule = {
  TranslatorBacking: new (options: {
    registryUrl: string;
    downloadTimeout: number;
  }) => Backing;
  BatchTranslator: new (
    options: { workers: number },
    backing: Backing,
  ) => Bergamot;
};

export async function translateSentence(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  progress: (message: string) => void,
): Promise<string> {
  if (sourceLanguage === targetLanguage)
    throw new Error("Choose a different translation language in Settings.");
  if (text.length > 30000)
    throw new Error("This sentence is too long to translate.");
  const options = { sourceLanguage, targetLanguage };
  let availability: Availability = "unavailable";
  if (ai.Translator) {
    try {
      availability = await ai.Translator.availability(options);
    } catch {
      // A website's Permissions Policy can block the browser API in its popup.
    }
  }
  if (ai.Translator && availability !== "unavailable") {
    progress(
      availability === "available"
        ? "Translating…"
        : "Downloading translation model…",
    );
    let translator:
      Awaited<ReturnType<typeof ai.Translator.create>> | undefined;
    try {
      translator = await ai.Translator.create({
        ...options,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            progress(
              `Downloading translation model… ${Math.round(event.loaded * 100)}%`,
            );
          });
        },
      });
      progress("Translating…");
      return await translator.translate(text);
    } catch {
      // Chrome can report a downloadable pair that it cannot create on this device.
    } finally {
      translator?.destroy();
    }
  }
  progress("Loading local translator…");
  const { BatchTranslator, TranslatorBacking } = (await import(
    /* @vite-ignore */ browser.runtime.getURL("/") + "bergamot/translator.js"
  )) as BergamotModule;
  class CachedBacking extends TranslatorBacking {
    override async fetch(
      url: string,
      checksum: string,
      options?: { signal?: AbortSignal },
    ) {
      const cache = await caches.open("translation-models");
      const key = `${url}?sha256=${checksum}`;
      const saved = await cache.match(key);
      if (saved) return saved.arrayBuffer();
      progress("Downloading translation model…");
      const buffer = await super.fetch(url, checksum, options);
      await cache.put(key, new Response(buffer));
      progress("Translating…");
      return buffer;
    }
  }
  const translator = new BatchTranslator(
    { workers: 1 },
    new CachedBacking({
      registryUrl: browser.runtime.getURL("/") + "bergamot-models.json",
      downloadTimeout: 300000,
    }),
  );
  try {
    return (
      await translator.translate({
        from: sourceLanguage,
        to: targetLanguage,
        text,
        html: false,
      })
    ).target.text;
  } finally {
    await translator.delete();
  }
}
