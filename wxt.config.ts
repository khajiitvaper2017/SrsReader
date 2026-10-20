import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "wxt";
import en from "./src/shared/i18n/locales/en.json";
import uk from "./src/shared/i18n/locales/uk.json";

export default defineConfig({
  srcDir: "src",
  entrypointsDir: "../entrypoints",
  modules: ["@wxt-dev/module-react"],
  zip: { excludeSources: ["dicts/**", "graft/**"] },
  hooks: {
    async "build:publicAssets"(_wxt, files) {
      for (const [locale, messages] of Object.entries({ en, uk })) {
        const folder = resolve(".wxt/locales", locale);
        await mkdir(folder, { recursive: true });
        const path = resolve(folder, "messages.json");
        await writeFile(
          path,
          JSON.stringify({
            extensionDescription: { message: messages.extension_description },
          }),
        );
        files.push({
          absoluteSrc: path,
          relativeDest: `_locales/${locale}/messages.json`,
        });
      }
      for (const file of [
        "translator.js",
        "worker/translator-worker.js",
        "worker/bergamot-translator-worker.js",
        "worker/bergamot-translator-worker.wasm",
      ])
        files.push({
          absoluteSrc: resolve(
            "node_modules/@browsermt/bergamot-translator",
            file,
          ),
          relativeDest: `bergamot/${file}`,
        });
    },
  },
  manifest: ({ browser }) => ({
    name: "SrsReader",
    ...(browser === "chrome" ? { minimum_chrome_version: "125" } : {}),
    default_locale: "en",
    description: "__MSG_extensionDescription__",
    permissions: ["storage", "unlimitedStorage"],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    host_permissions: ["http://*/*", "https://*/*"],
    action: { default_title: "SrsReader" },
    icons: { 16: "icons/16.png", 48: "icons/48.png", 128: "icons/128.png" },
    options_ui: { page: "app.html#settings", open_in_tab: true },
    web_accessible_resources: [
      { resources: ["lookup.html"], matches: ["http://*/*", "https://*/*"] },
    ],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "srs-reader@local.extension",
              strict_min_version: "147.0",
              data_collection_permissions: {
                required: ["none"],
                optional: ["websiteContent"],
              },
            },
          },
        }
      : {}),
  }),
});
