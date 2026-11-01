import { importPackage } from "@/anki/import";
import type { AnkiImportOptions } from "@/anki/model";
import { setInterfaceLanguage } from "@/shared/i18n/i18n";

self.onmessage = async (
  event: MessageEvent<{
    blob: Blob;
    options: AnkiImportOptions;
    locale: string;
  }>,
) => {
  try {
    await setInterfaceLanguage(event.data.locale);
    const result = await importPackage(
      event.data.blob,
      event.data.options,
      (progress) => self.postMessage({ progress }),
    );
    self.postMessage({ result });
  } catch (error) {
    console.error("[SrsReader] Anki import failed", error);
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
