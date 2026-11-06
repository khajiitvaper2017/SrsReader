/// <reference types="node" />
/**
 * pnpm benchmark (Node 24+). Requires pnpm build and pnpm test:browser in another
 * terminal, with the saved German/Czech dictionaries. Never imports or resets it.
 * BENCH_SAMPLES=7 BENCH_REPORT=test-results/action-benchmarks.json pnpm benchmark
 * Cold = extension-worker memory caches restarted, NOT cold OS/disk caches.
 * Saved-profile actions are read-only; vocabulary/reviews use a disposable profile.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  chromium,
  expect,
  type BrowserContext,
  type Frame,
  type Page,
} from "@playwright/test";
import type { Request, Responses } from "../src/background/contracts.ts";
import type { Settings } from "../src/settings/model.ts";

type LookupBinding = Exclude<
  Settings["lookupBindings"][number],
  { type: "touch" }
>;
declare const chrome: {
  runtime: {
    sendMessage(
      request: unknown,
    ): Promise<{ value: unknown; error?: string } | undefined>;
  };
};

const samples = Number(process.env.BENCH_SAMPLES || 5);
assert(
  Number.isInteger(samples) && samples >= 3 && samples <= 100,
  "BENCH_SAMPLES must be 3–100",
);
const reportPath = resolve(
  process.env.BENCH_REPORT || "test-results/action-benchmarks.json",
);
const results: {
  action: string;
  samples: Record<string, number>[];
  details?: unknown;
}[] = [];
const failures: { action: string; error: string }[] = [];
const pages: Page[] = [];
let isolated: BrowserContext | undefined;
let profile: string | undefined;
let currentAction = "prerequisites";
let cleanupPromise: Promise<void> | undefined;
let environment: Record<string, unknown> = {};
const browser = await chromium
  .connectOverCDP("http://127.0.0.1:9223")
  .catch((cause) => {
    throw new Error(
      "Start the saved headless browser with pnpm test:browser first.",
      { cause },
    );
  });
const context = browser.contexts()[0]!;
const worker = context
  .serviceWorkers()
  .find((worker) => worker.url().startsWith("chrome-extension://"));
const extensionUrl =
  worker?.url() ||
  context
    .pages()
    .find((page) => page.url().startsWith("chrome-extension://"))
    ?.url();
const workerUrl = extensionUrl && new URL(extensionUrl);
const origin = workerUrl && `${workerUrl.protocol}//${workerUrl.host}`;
const workerScript = worker?.url() || `${origin}/background.js`;
const server = createServer((request, response) => {
  const language = request.url?.includes("/cs/") ? "cs" : "de";
  const text =
    language === "de"
      ? "Das Haus steht am Fluss. Der Hund spielt im Garten. Die Menschen lesen heute ein gutes Buch."
      : "Ten pes stojí před domem. Lidé čtou dobrou knihu. Dnes je krásný den a děti si hrají na zahradě.";
  const term = language === "de" ? "Haus" : "pes";
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(
    `<!doctype html><html lang="${language}"><meta charset="utf-8"><title>Reader benchmark</title><style>body{font:20px/1.7 sans-serif;max-width:850px;margin:32px auto}p{margin:24px 0}</style><body><p id="lookup">${term}</p>${Array.from({ length: 24 }, (_, i) => `<p>${text} ${i + 1}.</p>`).join("")}<div id="incremental"></div></body></html>`,
  );
});

async function rpc<R extends Request>(
  page: Page,
  request: R,
): Promise<Responses[R["action"]]> {
  return page.evaluate(async (request) => {
    const response = await chrome.runtime.sendMessage(request);
    if (!response)
      throw new Error(
        `No response for ${request.action}; check request validation and the loaded build`,
      );
    if (response.error) throw new Error(response.error);
    return response.value;
  }, request) as Promise<Responses[R["action"]]>;
}

async function painted(frame: Page | Frame) {
  await frame.evaluate(() => {
    const { promise, resolve } = Promise.withResolvers<void>();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    return promise;
  });
}

function add(
  action: string,
  values: Record<string, number>,
  details?: unknown,
) {
  assert(
    Object.values(values).every(Number.isFinite),
    `${action}: non-finite measurement`,
  );
  let result = results.find((result) => result.action === action);
  if (!result) {
    result = { action, samples: [], details };
    results.push(result);
  }
  result.samples.push(values);
}

async function timed(
  action: string,
  run: () => Promise<void>,
  delayMs = 0,
  details?: unknown,
) {
  currentAction = action;
  const started = performance.now();
  await run();
  const totalMs = performance.now() - started;
  add(
    action,
    {
      totalMs,
      deliberateDelayMs: delayMs,
      processingResidualMs: Math.max(0, totalMs - delayMs),
    },
    details,
  );
}

function nextScan(page: Page) {
  return page
    .waitForEvent("console", {
      timeout: 60000,
      predicate: async (message) =>
        message.text().startsWith("[SrsReader] Scan summary") &&
        (await message.args()[1]?.jsonValue())?.context === "website",
    })
    .then(async (message) => {
      const summary = (await message.args()[1]!.jsonValue()) as {
        blocks: number;
        failedGroups: number;
        wallMs: number;
        firstVisibleSinceNavigationMs: number | null;
        requestWallMs: number;
        workerTotals: Record<string, number>;
        [key: string]: unknown;
      };
      assert(
        summary.blocks > 0 && summary.failedGroups === 0,
        `Scan failed: ${JSON.stringify(summary)}`,
      );
      return summary;
    });
}

async function coldWorker(page: Page) {
  const session = await context.newCDPSession(page);
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const timer = setTimeout(
    () =>
      reject(new Error("Could not locate extension worker for cold lookup")),
    10000,
  );
  try {
    session.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
      const version = versions.find(
        (version) =>
          version.scriptURL === workerScript &&
          version.runningStatus === "running",
      );
      if (version) resolve(version.versionId);
    });
    await session.send("ServiceWorker.enable");
    await session.send("ServiceWorker.stopWorker", {
      versionId: await promise,
    });
    await rpc(page, { action: "settings" });
  } finally {
    clearTimeout(timer);
    await session.detach();
  }
}

async function gesture(
  page: Page,
  binding: LookupBinding,
  point: { x: number; y: number },
) {
  const keys = [
    binding.ctrl && "Control",
    binding.alt && "Alt",
    binding.shift && "Shift",
    binding.meta && "Meta",
  ].filter((key): key is string => !!key);
  for (const key of keys) await page.keyboard.down(key);
  try {
    await page.mouse.move(point.x, point.y);
    if (binding.type === "mouse") {
      assert(
        binding.button <= 2,
        "Benchmark supports primary, middle, and secondary mouse bindings",
      );
      await page.mouse.click(point.x, point.y, {
        button: (["left", "middle", "right"] as const)[binding.button],
      });
    } else if (binding.type === "key") {
      await page.keyboard.press(binding.code);
    } else if (binding.code) {
      await page.keyboard.down(binding.code);
    }
  } finally {
    // Hover activation needs its configured dwell before releasing modifiers.
    if (binding.type === "hover") await page.waitForTimeout(260);
    if (binding.type === "hover" && binding.code)
      await page.keyboard.up(binding.code);
    for (const key of keys.toReversed()) await page.keyboard.up(key);
  }
}

async function dictionaryReady(frame: Frame) {
  await frame
    .locator(".dictionary-content")
    .first()
    .waitFor({ state: "visible" });
  await expect(frame.locator(".dictionary-content").first()).not.toHaveText("");
  await frame.waitForFunction(() =>
    document.querySelector("[data-dictionary] > style")?.textContent?.trim(),
  );
  await painted(frame);
}

async function lookup(page: Page, binding: LookupBinding, action: string) {
  await page.locator("#lookup").scrollIntoViewIfNeeded();
  const box = await page.locator("#lookup").boundingBox();
  assert(box);
  const point = { x: box.x + 10, y: box.y + box.height / 2 };
  await timed(
    action,
    async () => {
      await gesture(page, binding, point);
      const handle = await page
        .locator("iframe[data-srs-reader]")
        .elementHandle();
      assert(handle, "Lookup did not open a popup");
      const frame = await handle.contentFrame();
      assert(frame);
      await dictionaryReady(frame);
    },
    binding.type === "hover" ? 260 : 0,
    {
      cache: action.endsWith("cold")
        ? "worker restarted; OS/disk cache uncontrolled"
        : "same term and worker",
      completion: "nonempty dictionary content and two animation frames",
      includes:
        "Playwright transport + popup preparation/iframe startup + lookup + render",
    },
  );
  const frame = await page.locator("iframe[data-srs-reader]").elementHandle();
  assert(frame);
  const content = await frame.contentFrame();
  assert(content);
  const renderMs = await content.evaluate(() => {
    if (
      "__benchDictionaryPaint" in globalThis &&
      typeof globalThis.__benchDictionaryPaint === "number"
    )
      return globalThis.__benchDictionaryPaint;
    return null;
  });
  assert(
    renderMs !== null,
    "Dictionary render observer did not observe content",
  );
  add(
    action.replace("lookup.", "dictionary.render."),
    { navigationToContentPaintMs: renderMs },
    {
      includes:
        "iframe navigation/bootstrap, RPC, dictionary DOM/CSS, two animation frames; not React-only render time",
    },
  );
  return content;
}

async function dismiss(page: Page) {
  const box = await page.locator("#lookup").boundingBox();
  assert(box);
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.locator("iframe[data-srs-reader]").waitFor({ state: "detached" });
}

async function nestedPoint(
  frame: Frame,
  metadata: Page,
  language: string,
  original: string,
) {
  const candidates = await frame
    .locator(".dictionary-content")
    .evaluateAll((elements, language) => {
      const candidates: { term: string; x: number; y: number }[] = [];
      for (const element of elements) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (
          let node = walker.nextNode();
          node && candidates.length < 60;
          node = walker.nextNode()
        ) {
          const marked = node.parentElement?.closest(
            "[lang],[data-reading-language]",
          );
          const declared =
            marked?.getAttribute("lang") ||
            marked?.getAttribute("data-reading-language");
          if (declared && declared.split("-")[0] !== language) continue;
          for (const match of (node.textContent || "").matchAll(
            /[\p{L}]{3,}/gu,
          )) {
            const range = document.createRange();
            range.setStart(node, match.index!);
            range.setEnd(node, match.index! + match[0].length);
            const box = range.getBoundingClientRect();
            if (
              box.width &&
              box.height &&
              box.top >= 0 &&
              box.bottom < innerHeight &&
              box.right < innerWidth
            )
              candidates.push({
                term: match[0],
                x: box.x + box.width / 2,
                y: box.y + box.height / 2,
              });
          }
        }
      }
      return candidates;
    }, language);
  candidates.sort(
    (a, b) =>
      Number(
        a.term.toLocaleLowerCase(language) ===
          original.toLocaleLowerCase(language),
      ) -
      Number(
        b.term.toLocaleLowerCase(language) ===
          original.toLocaleLowerCase(language),
      ),
  );
  for (const candidate of candidates) {
    const result = await rpc(metadata, {
      action: "lookup",
      language,
      term: candidate.term,
    });
    if (result.words.some((word) => word.meanings.length)) return candidate;
  }
  throw new Error(
    `No visible ${language} dictionary word with a nested lookup result. No nested sample was recorded.`,
  );
}

async function savedActions(
  metadata: Page,
  binding: LookupBinding,
  base: string,
) {
  for (const language of ["de", "cs"]) {
    const page = await context.newPage();
    pages.push(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => {
      if (!location.pathname.endsWith("lookup.html")) return;
      const observer = new MutationObserver(() => {
        const content = document.querySelector(".dictionary-content");
        if (
          !content?.textContent?.trim() ||
          !content.getBoundingClientRect().height ||
          !content
            .closest("[data-dictionary]")
            ?.querySelector(":scope > style")
            ?.textContent?.trim()
        )
          return;
        observer.disconnect();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            // Only the benchmark's own frame reads this observer timestamp.
            const target = globalThis as typeof globalThis & {
              __benchDictionaryPaint: number;
            };
            target.__benchDictionaryPaint = performance.now();
          }),
        );
      });
      observer.observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    for (let index = 0; index < samples; index++) {
      console.log(`${language}: reader sample ${index + 1}/${samples}`);
      currentAction = `${language}.scan.page`;
      let scan = nextScan(page);
      const started = performance.now();
      await page.goto(`${base}/${language}/${index}`, {
        waitUntil: "domcontentloaded",
      });
      const initial = await scan;
      await painted(page);
      assert(
        initial.firstVisibleSinceNavigationMs !== null,
        "No observable initial viewport highlight; enable word colors and automatic loading",
      );
      add(`${language}.scan.initial-viewport`, {
        navigationToHighlightMs: initial.firstVisibleSinceNavigationMs,
      });
      add(
        `${language}.scan.page`,
        { totalMs: performance.now() - started, ...scanMetrics(initial) },
        initial,
      );
      currentAction = `${language}.scan.incremental-scroll`;
      scan = nextScan(page);
      const incrementalStarted = performance.now();
      await page.evaluate((index) => {
        const container = document.querySelector("#incremental")!;
        for (let i = 0; i < 8; i++) {
          const p = document.createElement("p");
          p.textContent = `${document.querySelectorAll("p")[2]!.textContent} ${1000 + index * 8 + i}.`;
          container.append(p);
        }
        container.scrollIntoView({ block: "end" });
      }, index);
      const incremental = await scan;
      await painted(page);
      add(
        `${language}.scan.incremental-scroll`,
        {
          totalMs: performance.now() - incrementalStarted,
          ...scanMetrics(incremental),
        },
        incremental,
      );
      await page.locator("#lookup").scrollIntoViewIfNeeded();
      currentAction = `${language}.lookup.cold`;
      await coldWorker(metadata);
      await lookup(page, binding, `${language}.lookup.cold`);
      await dismiss(page);
      const frame = await lookup(page, binding, `${language}.lookup.warm`);
      const term = language === "de" ? "Haus" : "pes";
      currentAction = `${language}.lookup.nested`;
      const candidate = await nestedPoint(frame, metadata, language, term);
      const iframeBox = await page
        .locator("iframe[data-srs-reader]")
        .boundingBox();
      assert(iframeBox);
      const previousContent = await frame
        .locator(".dictionary-content")
        .first()
        .elementHandle();
      assert(previousContent);
      await timed(
        `${language}.lookup.nested`,
        async () => {
          await gesture(page, binding, {
            x: iframeBox.x + candidate.x,
            y: iframeBox.y + candidate.y,
          });
          await expect(
            frame.getByRole("button", { name: "Previous word", exact: true }),
          ).toBeVisible();
          await expect
            .poll(() =>
              previousContent.evaluate((element) => element.isConnected),
            )
            .toBe(false);
          await dictionaryReady(frame);
        },
        binding.type === "hover" ? 260 : 0,
        {
          term: candidate.term,
          cache: "candidate validated outside timing; warm dictionary cache",
        },
      );
      await dismiss(page);
    }
    await page.close();
  }
}

function scanMetrics(summary: {
  requestWallMs: number;
  workerTotals: Record<string, number>;
  [key: string]: unknown;
}) {
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(summary))
    if (typeof value === "number") metrics[key] = value;
  for (const [key, value] of Object.entries(summary.workerTotals))
    metrics[`worker.${key}`] = value;
  // Summed concurrent worker work can exceed wall time. Keep the signed residual.
  metrics.rpcResidualMs =
    summary.requestWallMs - (summary.workerTotals.workerMs || 0);
  return metrics;
}

async function fixtureActions() {
  currentAction = "isolated fixture setup";
  console.log("Preparing disposable vocabulary and study data");
  profile = await mkdtemp(join(tmpdir(), "srs-reader-bench-"));
  const extension = resolve(".output/chrome-mv3");
  isolated = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
    ],
  });
  const worker =
    isolated.serviceWorkers()[0] ??
    (await isolated.waitForEvent("serviceworker"));
  const url = new URL(worker.url());
  const base = `${url.protocol}//${url.host}`;
  const metadata = await isolated.newPage();
  await metadata.goto(`${base}/manifest.json`);
  const settings = await rpc(metadata, { action: "settings" });
  await metadata.evaluate(async (settings) => {
    const opened = Promise.withResolvers<IDBDatabase>();
    const request = indexedDB.open("srs-reader");
    request.onsuccess = () => opened.resolve(request.result);
    request.onerror = () => opened.reject(request.error);
    const db = await opened.promise;
    try {
      const completed = Promise.withResolvers<void>();
      const transaction = db.transaction("settings", "readwrite");
      transaction.oncomplete = () => completed.resolve();
      transaction.onabort = () => completed.reject(transaction.error);
      transaction.onerror = () => completed.reject(transaction.error);
      transaction.objectStore("settings").put({
        id: "main",
        value: {
          ...settings,
          setupComplete: true,
          studyLanguages: ["de"],
          nativeLanguages: ["en"],
          interfaceLanguage: "en",
          autoplay: false,
          audioSources: [],
          udpipe: false,
          scanPopups: false,
          newLimit: 200,
          reviewLimit: null,
          timedReview: { ...settings.timedReview, enabled: false },
        },
      });
      await completed.promise;
    } finally {
      db.close();
    }
  }, settings);
  const count = Math.max(60, samples + 2);
  for (let index = 0; index < count; index++) {
    const term = `Benchwort${String(index).padStart(3, "0")}`;
    const definition = `Benchmark definition ${index}. A local fixture; never stored in the saved profile.`;
    const save = async () => {
      const word = await rpc(metadata, {
        action: "defineWord",
        language: "de",
        term,
        definition,
      });
      assert.equal(word.lemma, term);
      assert(
        word.meanings.some((meaning) =>
          meaning.definitions.includes(definition),
        ),
      );
      assert.equal(word.linkedCards.length, 1);
    };
    if (index < samples)
      await timed("vocabulary.save-custom-word", save, 0, {
        profile: "isolated",
        includes:
          "RPC, new word/definition, card snapshot, and persistent storage; no UI paint",
      });
    else await save();
  }
  const page = await isolated.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  for (let index = 0; index < samples; index++) {
    console.log(`Vocabulary sample ${index + 1}/${samples}`);
    await page.goto(`${base}/app.html#words/de`);
    const search = page.getByRole("searchbox", {
      name: "Search words",
      exact: true,
    });
    await search.waitFor();
    const term = `Benchwort${String(index).padStart(3, "0")}`;
    await timed(
      "vocabulary.search",
      async () => {
        await search.fill(term);
        await expect(
          page.getByRole("button").filter({ hasText: /^Benchwort/ }),
        ).toHaveCount(1);
        await expect(
          page.getByRole("button").filter({ hasText: new RegExp(`^${term}`) }),
        ).toBeVisible();
        await painted(page);
      },
      150,
      {
        fixtureWords: count,
        profile: "isolated",
        deliberateDelay: "existing search debounce",
        includes:
          "input + debounce + query + list paint + Playwright transport",
      },
    );
    await timed(
      "vocabulary.open",
      async () => {
        await page
          .getByRole("button")
          .filter({ hasText: new RegExp(`^${term}`) })
          .click();
        await expect(
          page.getByRole("heading", { name: term, exact: true }),
        ).toBeVisible();
        await page
          .locator(".dictionary-content")
          .first()
          .waitFor({ state: "visible" });
        await painted(page);
      },
      0,
      { profile: "isolated", fixtureWords: count },
    );
  }
  const card = page
    .frameLocator('iframe[title="Study card"]')
    .frameLocator("iframe:visible:not([inert])")
    .locator("body");
  for (let index = 0; index < samples; index++) {
    console.log(`Study sample ${index + 1}/${samples}`);
    let before = "";
    await timed(
      "study.question",
      async () => {
        await page.goto(`${base}/app.html#review/session/de`);
        await expect(card).toContainText("Benchwort");
        await expect(
          page.getByRole("button", { name: "Show answer", exact: true }),
        ).toBeVisible();
        before = (await card.innerText()).trim();
        await painted(page);
      },
      0,
      {
        profile: "isolated",
        cards: count,
        completion: "question iframe content and reveal control",
      },
    );
    await timed(
      "study.reveal",
      async () => {
        await page
          .getByRole("button", { name: "Show answer", exact: true })
          .click();
        await expect(card).toContainText("Benchmark definition");
        await expect(page.getByRole("button", { name: /^Good/ })).toBeEnabled();
        await painted(page);
      },
      0,
      { profile: "isolated" },
    );
    await timed(
      "study.rating",
      async () => {
        await page.getByRole("button", { name: /^Good/ }).click();
        await expect(
          page.getByRole("button", { name: "Show answer", exact: true }),
        ).toBeVisible();
        await expect(card).toContainText("Benchwort");
        await expect(card).not.toHaveText(before);
        await expect(card).not.toContainText("Benchmark definition");
        await painted(page);
      },
      0,
      {
        profile: "isolated",
        completion:
          "next question rendered after persistent grade/queue update",
      },
    );
    await page.goto(`${base}/manifest.json`);
  }
  const reviews = await metadata.evaluate(async () => {
    const opened = Promise.withResolvers<IDBDatabase>();
    const request = indexedDB.open("srs-reader");
    request.onsuccess = () => opened.resolve(request.result);
    request.onerror = () => opened.reject(request.error);
    const db = await opened.promise;
    try {
      const counted = Promise.withResolvers<number>();
      const request = db.transaction("reviews").objectStore("reviews").count();
      request.onsuccess = () => counted.resolve(request.result);
      request.onerror = () => counted.reject(request.error);
      return await counted.promise;
    } finally {
      db.close();
    }
  });
  assert.equal(
    reviews,
    samples,
    "Each measured rating must create exactly one real review",
  );
}

async function cleanup() {
  cleanupPromise ??= (async () => {
    const errors: unknown[] = [];
    console.log("Closing benchmark pages and disposable profile");
    for (const page of pages)
      if (!page.isClosed())
        await page.close().catch((error) => errors.push(error));
    let isolatedClosed = true;
    if (isolated)
      await isolated.close().catch((error) => {
        isolatedClosed = false;
        errors.push(error);
      });
    if (profile && isolatedClosed)
      await rm(profile, { recursive: true, force: true }).catch((error) =>
        errors.push(error),
      );
    if (server.listening) {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    }
    await browser.close().catch((error) => errors.push(error)); // CDP disconnect, not the saved browser process.
    if (errors.length)
      throw new AggregateError(
        errors,
        `Benchmark cleanup failed${profile ? `; temporary profile: ${profile}` : ""}`,
      );
  })();
  return cleanupPromise;
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    failures.push({ action: currentAction, error: `Interrupted by ${signal}` });
    process.exitCode = 1;
    void cleanup().catch((error) => console.error(error));
  });

try {
  assert(origin, "No SrsReader extension page or worker in the saved browser");
  const browserSession = await browser.newBrowserCDPSession();
  const version = await browserSession.send("Browser.getVersion");
  await browserSession.detach();
  assert(
    /HeadlessChrome/.test(version.userAgent),
    "Benchmarks require the headless saved browser",
  );
  const metadata = await context.newPage();
  pages.push(metadata);
  await metadata.goto(`${origin}/manifest.json`);
  const settings = await rpc(metadata, { action: "settings" });
  environment = {
    settings: {
      studyLanguages: settings.studyLanguages,
      udpipe: settings.udpipe,
      udpipeModels: settings.udpipeModels,
      wordLoading: settings.wordLoading,
      splitGermanCompounds: settings.splitGermanCompounds,
      scanPopups: settings.scanPopups,
      hideDictionarySources: settings.hideDictionarySources,
      dictionaryPreferences: settings.dictionaryPreferences,
      lookupBindings: settings.lookupBindings,
      wordColorsEnabled: settings.wordColorsEnabled,
    },
  };
  assert(
    settings.setupComplete && !settings.paused && settings.wordColorsEnabled,
    "Finish setup, unpause the reader, and enable word colors before benchmarking",
  );
  assert(
    settings.studyLanguages.includes("de") &&
      settings.studyLanguages.includes("cs"),
    "Saved profile must study German and Czech",
  );
  assert(
    ["de", "cs"].every(
      (language) => settings.wordLoading[language] !== "onLookup",
    ),
    "German/Czech automatic scanning must be enabled",
  );
  assert(
    !settings.disabledHosts.includes("127.0.0.1") &&
      (!settings.enabledHosts.length ||
        settings.enabledHosts.includes("127.0.0.1")),
    "Reader host settings must allow 127.0.0.1",
  );
  const binding = settings.lookupBindings.find(
    (binding): binding is LookupBinding =>
      binding.type !== "touch" &&
      (binding.type !== "mouse" || binding.button <= 2),
  );
  assert(
    binding,
    "Configure a mouse/key/hover lookup binding before benchmarking",
  );
  const dictionaries = await rpc(metadata, { action: "dictionaries" });
  environment.dictionaries = dictionaries.map(
    ({ id, index, language, enabled, count }) => ({
      id,
      title: index.title,
      language,
      enabled,
      count,
    }),
  );
  for (const language of ["de", "cs"])
    assert(
      dictionaries.some(
        (dictionary) =>
          dictionary.language === language &&
          dictionary.enabled &&
          dictionary.count > 0,
      ),
      `No enabled ${language} dictionary in saved profile`,
    );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  await savedActions(metadata, binding, `http://127.0.0.1:${address.port}`);
  assert.deepEqual(
    await rpc(metadata, { action: "settings" }),
    settings,
    "Saved settings changed during read-only actions",
  );
  await fixtureActions();
} catch (error) {
  failures.push({
    action: currentAction,
    error:
      error instanceof Error ? error.stack || error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => {
    failures.push({ action: "cleanup", error: String(error) });
    process.exitCode = 1;
  });
  const percentile = (values: number[], fraction: number) =>
    values.toSorted((a, b) => a - b)[
      Math.max(0, Math.ceil(values.length * fraction) - 1)
    ]!;
  const actions = results.map((result) => ({
    ...result,
    status: result.samples.length === samples ? "measured" : "incomplete",
    metrics: Object.fromEntries(
      Object.keys(result.samples[0]!).map((metric) => {
        const values = result.samples.map((sample) => sample[metric]!);
        const sorted = values.toSorted((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return [
          metric,
          {
            median:
              sorted.length % 2
                ? sorted[middle]
                : (sorted[middle - 1]! + sorted[middle]!) / 2,
            p95: percentile(values, 0.95),
          },
        ];
      }),
    ),
  }));
  const report = {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    browser: browser.version(),
    requestedSamples: samples,
    status: failures.length ? "failed" : "passed",
    failures,
    environment,
    notes: [
      "No timing thresholds. Milliseconds unless a metric name denotes counts/bytes.",
      "Actions include Playwright transport unless explicitly navigation-relative.",
      "processingResidualMs subtracts the intentional hover/search debounce, not measured scheduler wait.",
      "rpcResidualMs is signed request wall minus summed timed worker work; includes IPC/scheduling/serialization and untimed cache-hit handling, not pure transport.",
      "Cold lookups restart only the extension service worker; OS/disk caches remain warm.",
      "Saved profile dictionaries/settings/progress are never written. Vocabulary/study fixtures are deleted with their temporary profile.",
      "Missing/failed actions are not skipped or reported as successful samples.",
    ],
    actions,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.table(
    actions.map((action) => {
      const metric =
        action.metrics.totalMs ||
        action.metrics.navigationToHighlightMs ||
        action.metrics.navigationToContentPaintMs;
      return {
        action: action.action,
        status: action.status,
        n: action.samples.length,
        medianMs: metric?.median?.toFixed(1),
        p95Ms: metric?.p95.toFixed(1),
      };
    }),
  );
  for (const failure of failures)
    console.error(`${failure.action}: ${failure.error}`);
  console.log(`${report.status.toUpperCase()}: ${reportPath}`);
}
