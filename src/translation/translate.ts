import { languageName } from "@/languages/codes";
import type { Availability } from "@/platform/browser-ai";
import { ai } from "@/platform/browser-ai";
import { t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

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
  if (sourceLanguage === targetLanguage) return text;
  if (text.length > 30000)
    throw new Error(t("this_sentence_is_too_long_to_translate"));
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
        ? t("translating")
        : t("downloading_translation_model"),
    );
    let translator:
      Awaited<ReturnType<typeof ai.Translator.create>> | undefined;
    try {
      translator = await ai.Translator.create({
        ...options,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            progress(
              t("downloading_translation_model_2", {
                value1: Math.round(event.loaded * 100),
              }),
            );
          });
        },
      });
      progress(t("translating"));
      return await translator.translate(text);
    } catch {
      // Chrome can report a downloadable pair that it cannot create on this device.
    } finally {
      translator?.destroy();
    }
  }
  progress(t("loading_local_translator"));
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
      progress(t("downloading_translation_model"));
      const buffer = await super.fetch(url, checksum, options);
      await cache.put(key, new Response(buffer));
      progress(t("translating"));
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
  } catch {
    throw new Error(
      t("translation_failed", {
        source: languageName(sourceLanguage),
        target: languageName(targetLanguage),
      }),
    );
  } finally {
    await translator.delete();
  }
}
