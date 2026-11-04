import { test as base, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Request, Responses } from "../src/background/contracts";

declare const chrome: {
  runtime: {
    sendMessage(request: unknown): Promise<{ value: unknown; error?: string }>;
  };
};

export const test = base.extend<{ extension: { page: Page; url: string } }>({
  extension: async ({ playwright }, use) => {
    const profile = await mkdtemp(join(tmpdir(), "srs-reader-e2e-"));
    const path = resolve(".output/chrome-mv3");
    const context = await playwright.chromium.launchPersistentContext(profile, {
      headless: true,
      channel: "chromium",
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        `--disable-extensions-except=${path}`,
        `--load-extension=${path}`,
        "--no-sandbox",
      ],
    });
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const workerUrl = new URL(worker.url());
      const url = `${workerUrl.protocol}//${workerUrl.host}`;
      const page = await context.newPage();
      await page.goto(`${url}/manifest.json`);
      await rpc(page, { action: "settings" });
      await use({ page, url });
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});
export { expect } from "@playwright/test";

export function rpc<R extends Request>(
  page: Page,
  request: R,
): Promise<Responses[R["action"]]> {
  return page.evaluate(async (request) => {
    const response = await chrome.runtime.sendMessage(request);
    if (response.error) throw new Error(response.error);
    return response.value;
  }, request) as Promise<Responses[R["action"]]>;
}

export function records<T>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(async (table) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("srs-reader");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(table).objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, table) as Promise<T[]>;
}

export async function seedLegacy(page: Page) {
  const now = Date.now();
  const day = 86400000;
  const oldSchedule = (
    state: number,
    reps: number,
    last: number | null,
    due: number,
  ) => ({
    due,
    scheduled_days: state === 2 ? 2 : 0,
    reps,
    lapses: state === 3 ? 1 : 0,
    learning_steps: 0,
    state,
    last_review: last,
    last_review_day: last === null ? null : Math.floor(last / day),
    interday: false,
    fsrs: { stability: reps ? 3 : 0, difficulty: reps ? 5 : 0 },
  });
  const cards = [];
  const reviews = [];
  let sequence = 0;
  for (const [id, state, ratings] of [
    ["new", 0, []],
    ["learning", 1, [1]],
    ["review", 2, [3, 3, 3]],
    ["relearning", 3, [3, 1]],
    ["incomplete", 2, [3]],
    ["empty", 2, []],
    ["broken", 2, [3, 3]],
    ["reset", 1, [3, 1, 1]],
  ] as const) {
    let before = null;
    for (const [index, rating] of ratings.entries()) {
      const time = now - (ratings.length - index + 2) * day;
      if (id === "reset" && index === 1) before = oldSchedule(0, 0, null, time);
      if (id === "broken" && index === 1)
        before = { ...before!, last_review: time - 2 * day };
      const reps =
        id === "incomplete"
          ? 4
          : id === "reset" && index > 0
            ? index
            : index + 1;
      const after = oldSchedule(
        index === ratings.length - 1 ? state : 2,
        reps,
        time,
        now - 1000,
      );
      reviews.push({
        id: `${id}:${index}`,
        cardId: id,
        language: "en",
        time,
        rating,
        source: "review",
        durationMs: 1000,
        before: {
          id,
          language: "en",
          version: index,
          srsVersion: index,
          schedule:
            id === "incomplete" ? oldSchedule(2, 3, time - day, time) : before,
          suspended: false,
          leech: false,
        },
        after,
        afterVersion: reps,
        afterSrsVersion: reps,
        log: {},
        scheduler: "ts-fsrs@5.4.2/FSRS-6",
        sequence: ++sequence,
        active: true,
        retention: 0.8,
      });
      before = after;
    }
    cards.push({
      id,
      noteId: id,
      templateOrdinal: 0,
      deckId: null,
      language: "en",
      schedule:
        before ??
        oldSchedule(
          state,
          state === 0 ? 0 : 3,
          state === 0 ? null : now - 3 * day,
          now - 1000,
        ),
      suspended: id === "relearning",
      leech: false,
      retentionOverride: null,
      srsVersion: before?.reps ?? 0,
      version: before?.reps ?? 0,
      created: now - 10 * day,
      updated: now,
    });
  }
  const notes = cards.map(({ id }) => ({
    id,
    noteTypeId: "fixture",
    language: "en",
    fields: [id, `Definition of ${id}`],
    tags: [],
    mediaNamespace: "fixture",
    version: 0,
    created: now,
    updated: now,
  }));
  const data = {
    settings: [
      {
        id: "main",
        value: {
          setupComplete: true,
          studyLanguages: ["en"],
          nativeLanguages: ["en"],
          interfaceLanguage: "en",
          algorithm: "fsrs",
          learningSteps: ["10m"],
          relearningSteps: ["10m"],
          onlyAgainGood: false,
        },
      },
    ],
    noteTypes: [
      {
        id: "fixture",
        name: "Fixture",
        kind: "standard",
        fields: [{ name: "Word" }, { name: "Definition" }],
        templates: [
          { name: "Word", front: "{{Word}}", back: "{{Definition}}" },
        ],
        css: "",
        bindings: { word: 0, definitions: 1 },
        created: now,
      },
    ],
    notes,
    cards,
    reviews,
    srsMeta: [{ id: "main", sequence, scheduledModel: "ts-fsrs@5.4.2/FSRS-6" }],
  };
  for (const other of page.context().pages())
    if (other !== page) await other.close();
  const session = await page.context().newCDPSession(page);
  await session.send("ServiceWorker.enable");
  await session.send("ServiceWorker.stopAllWorkers");
  await session.detach();
  await page.evaluate(async (data) => {
    const open = (version?: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("srs-reader", version);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const database = await open();
    const tx = database.transaction([...database.objectStoreNames]);
    const schemas = [...database.objectStoreNames].map((name) => {
      const store = tx.objectStore(name);
      return {
        name,
        keyPath: store.keyPath!,
        autoIncrement: store.autoIncrement,
        indexes: [...store.indexNames]
          .filter((name) => name !== "[time+sequence]")
          .map((name) => {
            const index = store.index(name);
            return {
              name,
              keyPath: index.keyPath,
              unique: index.unique,
              multiEntry: index.multiEntry,
            };
          }),
      };
    });
    database.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("srs-reader");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("srs-reader", 220);
      request.onupgradeneeded = () => {
        for (const schema of schemas) {
          const store = request.result.createObjectStore(schema.name, {
            keyPath: schema.keyPath,
            autoIncrement: schema.autoIncrement,
          });
          for (const index of schema.indexes)
            store.createIndex(index.name, index.keyPath, index);
          for (const row of (data as Record<string, unknown[]>)[schema.name] ??
            [])
            store.put(row);
        }
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }, data);
  return data;
}
