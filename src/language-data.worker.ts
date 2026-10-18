import { setInterfaceLanguage } from "./i18n";
import { installExampleCorpus } from "./example-corpus";

self.onmessage = async (
  event: MessageEvent<{
    locale: string;
    type: "examples";
    language: string;
    blob?: Blob;
  }>,
) => {
  await setInterfaceLanguage(event.data.locale);
  try {
    const progress = (value: unknown) => self.postMessage({ progress: value });
    const count = await installExampleCorpus(
      event.data.language,
      event.data.blob,
      progress,
    );
    self.postMessage({ count });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
