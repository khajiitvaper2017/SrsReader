import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "wxt";
import en from "./src/shared/i18n/locales/en.json";
import uk from "./src/shared/i18n/locales/uk.json";

// Public key only: fixes the unpacked Chromium ID used by the Google Chrome
// extension OAuth client. No signing key or OAuth client secret is bundled.
const chromiumKey =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyxu+YaR5pEgMuX0vWacW0ag8Ic36AA74q14jBYxChU0l8CtgYbOx4PmSUaW7e+z8gqKeEYCq47r/lWRF03joFYgnRLtOfsyUrZGuJVCznp7TyyWJdozvjiqjPZSirHc0+MZQ7Smw8fMZvNRuXyAy/5JKmx6m7+vAZtszIaqTs2MABSh5onlZWWep5dPEtPgz7qCHvD4/A75dxOAg1jc+/oql5dVutT4tWY+1lqWFuC8ssLOuz2jvW6/ziB19OEc8qUIz+10LnidvQtqSurlxHSb+E+tRaMVPEuF9Iud/cefvc7t7WWZ7ON1QLbZqS1mVha7z4gGzcHNxaiM762EIHwIDAQAB";

function chromiumOAuth(mode: string) {
  const clientId =
    process.env[
      mode === "store"
        ? "WXT_GOOGLE_PRODUCTION_CLIENT_ID"
        : "WXT_GOOGLE_TEST_CLIENT_ID"
    ]?.trim();
  if (!clientId) return {};
  return {
    oauth2: {
      client_id: clientId,
      scopes: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/drive.appdata",
      ],
    },
  };
}

export default defineConfig({
  srcDir: "src",
  entrypointsDir: "../entrypoints",
  modules: ["@wxt-dev/module-react"],
  zip: { excludeSources: ["dicts/**", "graft/**"] },
  vite: () => ({
    resolve: {
      alias: [
        {
          find: /^zod$/,
          replacement: resolve("src/platform/validation.ts"),
        },
      ],
    },
    plugins: [
      {
        name: "block-page-paint-until-settings",
        transformIndexHtml: {
          order: "post",
          handler: (html, { bundle }) => {
            html = html.replaceAll(
              '<script type="module"',
              '<script type="module" blocking="render"',
            );
            // Inline CSS to avoid another Android file-picker read.
            return html.replace(
              /<link rel="stylesheet"[^>]* href="([^"]+)"[^>]*>/g,
              (link, href: string) => {
                const asset = bundle?.[href.slice(1)];
                return asset?.type === "asset" &&
                  typeof asset.source === "string"
                  ? `<style>${asset.source.replace(/<\/style/gi, "<\\/style")}</style>`
                  : link;
              },
            );
          },
        },
      },
    ],
  }),
  hooks: {
    "entrypoints:grouped"(_wxt, groups) {
      // Shared chunks make every page wait on many slow Android file-picker reads.
      for (let index = groups.length - 1; index >= 0; index--) {
        const group = groups[index];
        if (Array.isArray(group))
          groups.splice(index, 1, ...group.map((entry) => [entry]));
      }
    },
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
      files.push({
        absoluteSrc: resolve(
          "node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm",
        ),
        relativeDest: "anki/sqlite3.wasm",
      });
    },
  },
  manifest: ({ browser, mode }) => ({
    name: "SrsReader",
    ...(browser === "chrome"
      ? {
          minimum_chrome_version: "125",
          key: chromiumKey,
          ...chromiumOAuth(mode),
        }
      : {}),
    default_locale: "en",
    description: "__MSG_extensionDescription__",
    permissions: [
      "storage",
      "unlimitedStorage",
      "alarms",
      ...(browser === "chrome"
        ? ["identity" as const, "offscreen" as const]
        : []),
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
      sandbox:
        "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline' blob: https:; img-src blob: data:; media-src blob: data:; font-src blob: data: https:; connect-src blob:; child-src 'self' blob:; form-action 'none'",
    },
    sandbox: { pages: ["card-viewer.html"] },
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
              strict_min_version: "154.0",
              data_collection_permissions: {
                required: ["none"],
                optional: [
                  "websiteContent",
                  "authenticationInfo",
                  "personallyIdentifyingInfo",
                ],
              },
            },
            gecko_android: { strict_min_version: "154.0" },
          },
        }
      : {}),
  }),
});
