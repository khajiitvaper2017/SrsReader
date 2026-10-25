import ImportWorker from "@/dictionaries/import.worker?worker";
import LanguageDataWorker from "@/languages/language-data.worker?worker";
import { importInputSchema, type ImportTask } from "@/imports/model";
import { db } from "@/platform/database/db";
import { rpc } from "@/platform/messaging/send";
import { readDownload, type ImportProgress } from "@/shared/download";
import { setInterfaceLanguage, t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

let running = false;

async function execute(task: ImportTask) {
  const input = importInputSchema.parse(task);
  await setInterfaceLanguage(input.locale);
  const report = (progress: ImportProgress) => {
    void db.importTasks.update("current", { progress }).catch(console.error);
  };
  let blob = input.blob;
  if (input.type === "dictionary" && input.url) {
    const phase = t("downloading_dictionary", { title: input.title });
    report({ phase, done: 0, total: 0 });
    const response = await fetch(input.url, { credentials: "omit" });
    if (!response.ok)
      throw new Error(
        t("dictionary_download_failed", { status: response.status }),
      );
    blob = await readDownload(response, phase, report);
    // Keep the downloaded archive if the browser stops during import.
    await db.importTasks.update("current", { blob, url: undefined });
  }
  report({ phase: t("importing"), done: 0, total: 0 });
  await new Promise<void>((resolve, reject) => {
    const worker =
      input.type === "dictionary"
        ? new ImportWorker()
        : new LanguageDataWorker();
    worker.onmessage = (event) => {
      if (event.data.progress) report(event.data.progress);
      if (
        event.data.error ||
        event.data.dictionary ||
        event.data.count !== undefined
      ) {
        worker.terminate();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve();
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(
        new Error(
          event.message ||
            t(
              input.type === "dictionary"
                ? "dictionary_import_failed"
                : "language_data_import_failed",
            ),
        ),
      );
    };
    worker.postMessage({ ...input, blob });
  });
}

async function run() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const task = await db.importTasks.get("current");
      if (task?.status !== "running") break;
      try {
        await execute(task);
        await rpc({ action: "invalidate" });
        await db.importTasks.update("current", {
          status: "complete",
          blob: undefined,
          progress: undefined,
          notice: t(
            task.type === "dictionary"
              ? "dictionary_imported"
              : task.type === "examples"
                ? "example_sentences_saved"
                : "word_forms_saved",
          ),
        });
      } catch (error) {
        console.error("[SrsReader] Import failed", error);
        await db.importTasks.update("current", {
          status: "error",
          blob: undefined,
          progress: undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    running = false;
    await rpc({ action: "closeImportHost" });
  }
}

export function startImportHost() {
  if (import.meta.env.BROWSER === "firefox") {
    const connection = browser.runtime.connect({ name: "import-host" });
    window.addEventListener("pagehide", () => connection.disconnect(), {
      once: true,
    });
  }
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.target !== "import-host" || sender.id !== browser.runtime.id)
      return;
    void run().catch(console.error);
    return Promise.resolve();
  });
}
