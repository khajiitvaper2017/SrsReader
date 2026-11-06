/// <reference types="node" />
import { once } from "node:events";
import { chromium } from "@playwright/test";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const extension = fileURLToPath(
  new URL("../.output/chrome-mv3", import.meta.url),
);
const profile = fileURLToPath(
  new URL("../.test-browser/profile", import.meta.url),
);
const endpoint = "http://127.0.0.1:9223";

await access(`${extension}/manifest.json`).catch(() => {
  throw new Error("Run pnpm build before starting the test browser.");
});

const port = createServer();
port.listen(9223, "127.0.0.1");
await once(port, "listening");
port.close();
await once(port, "close");

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: "chromium",
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=9223",
    "--no-sandbox",
  ],
});

try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 30000 }));
  const url = new URL(worker.url());
  const app = `${url.protocol}//${url.host}/app.html`;
  if (!context.pages().some((page) => page.url().startsWith(app))) {
    const page = await context.newPage();
    await page.goto(app);
  }
  console.log(`Headless test browser ready: ${endpoint}`);
  console.log(`Profile: ${profile}`);
  console.log(`App: ${app}`);
  console.log("Ctrl+C stops the browser without deleting its data.");
} catch (error) {
  await context.close();
  throw error;
}

await context.waitForEvent("close", { timeout: 0 });
