export type Availability =
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

export type Detector = {
  detect(
    text: string,
  ): Promise<{ detectedLanguage: string; confidence: number }[]>;
};

export const ai = globalThis as typeof globalThis & {
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
