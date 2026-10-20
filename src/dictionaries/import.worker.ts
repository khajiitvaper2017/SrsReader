import { importDictionary } from "@/dictionaries/management";
import { setInterfaceLanguage } from "@/shared/i18n/i18n";

self.onmessage = async (
  event: MessageEvent<{
    locale: string;
    blob: Blob;
    language: string;
    expectedId?: string;
  }>,
) => {
  await setInterfaceLanguage(event.data.locale);
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
