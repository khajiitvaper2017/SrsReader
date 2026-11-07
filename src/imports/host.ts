import ImportWorker from "@/dictionaries/import.worker?worker";
import LanguageDataWorker from "@/languages/language-data.worker?worker";
import AnkiImportWorker from "@/anki/import.worker?worker";
import ExamplesWorker from "@/examples/query.worker?worker";
import { importInputSchema, type ImportTask } from "@/imports/model";
import { db } from "@/platform/database/db";
import { rpc } from "@/platform/messaging/send";
import { readDownload, type ImportProgress } from "@/shared/download";
import { setInterfaceLanguage, t } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";

let running = false;

async function execute(task: ImportTask) {
  await setInterfaceLanguage(task.locale);
  const archive = (await db.importFiles.get("current"))?.blob;
  if (
    (task.type === "dictionary" || task.type === "anki") &&
    !archive &&
    !task.url
  )
    throw new Error(t("import_source_missing"));
  const input = importInputSchema.parse({
    ...task,
    blob: archive,
  });
  const report = (progress: ImportProgress) => {
    void db.importTasks
      .where("id")
      .equals("current")
      .filter(
        (current) =>
          current.runId === task.runId && current.status === "running",
      )
      .modify({ progress })
      .catch(console.error);
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
    await db.importFiles.put({ id: "current", blob });
    await db.importTasks.update("current", { url: undefined });
  }
  report({ phase: t("importing"), done: 0, total: 0 });
  await new Promise<void>((resolve, reject) => {
    const worker =
      input.type === "dictionary"
        ? new ImportWorker()
        : input.type === "anki"
          ? new AnkiImportWorker()
          : new LanguageDataWorker();
    worker.onmessage = (event) => {
      if (event.data.progress) report(event.data.progress);
      if (
        event.data.error ||
        event.data.result ||
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
              input.type === "anki"
                ? "anki_invalid_package"
                : input.type === "dictionary"
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
        await db.transaction(
          "rw",
          [db.importTasks, db.importFiles],
          async () => {
            await db.importFiles.delete("current");
            await db.importTasks.update("current", {
              status: "complete",
              progress: undefined,
              notice: t(
                task.type === "anki"
                  ? "anki_imported"
                  : task.type === "dictionary"
                    ? "dictionary_imported"
                    : task.type === "examples"
                      ? "example_sentences_saved"
                      : "word_forms_saved",
              ),
            });
          },
        );
        await rpc({ action: "invalidate" }).catch(console.error);
      } catch (error) {
        console.error("[SrsReader] Import failed", error);
        await db.transaction(
          "rw",
          [db.importTasks, db.importFiles],
          async () => {
            await db.importFiles.delete("current");
            await db.importTasks.update("current", {
              status: "error",
              progress: undefined,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );
      }
    }
  } finally {
    running = false;
    if ((await db.importTasks.get("current"))?.status === "running") {
      void run().catch(console.error);
    } else await rpc({ action: "closeImportHost" });
  }
}

export function startImportHost() {
  let connection: ReturnType<typeof browser.runtime.connect>;
  let closing = false;
  let examplesWorker: Worker | undefined;
  const exampleQueries = new Set<string>();
  const connect = () => {
    connection = browser.runtime.connect({ name: "import-host" });
    connection.onMessage.addListener((message) => {
      if (message?.type === "run") void run().catch(console.error);
      if (message?.type !== "examples") return;
      try {
        if (!examplesWorker) {
          examplesWorker = new ExamplesWorker();
          examplesWorker.onmessage = (event) => {
            exampleQueries.delete(event.data.id);
            connection.postMessage({ type: "examples-result", ...event.data });
          };
          examplesWorker.onerror = (event) => {
            for (const id of exampleQueries)
              connection.postMessage({
                type: "examples-result",
                id,
                error: event.message || t("background_host_failed"),
              });
            exampleQueries.clear();
            examplesWorker?.terminate();
            examplesWorker = undefined;
          };
        }
        exampleQueries.add(message.id);
        examplesWorker.postMessage({
          id: message.id,
          request: message.request,
        });
      } catch (error) {
        exampleQueries.delete(message.id);
        connection.postMessage({
          type: "examples-result",
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    connection.onDisconnect.addListener(() => {
      if (!closing) connect();
    });
    connection.postMessage({ type: "ready" });
  };
  window.addEventListener(
    "pagehide",
    () => {
      closing = true;
      connection.disconnect();
      examplesWorker?.terminate();
    },
    { once: true },
  );
  connect();
}
