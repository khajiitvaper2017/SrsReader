import { importDictionary } from "./dictionaries";

self.onmessage = async (
  event: MessageEvent<{ blob: Blob; language: string; expectedId?: string }>,
) => {
  try {
    const dictionary = await importDictionary(
      event.data.blob,
      event.data.language,
      (progress) => self.postMessage({ progress }),
      event.data.expectedId,
    );
    self.postMessage({ dictionary });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
