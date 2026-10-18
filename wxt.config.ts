import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  zip: { excludeSources: ["dicts/**", "graft/**"] },
  manifest: ({ browser }) => ({
    name: "SrsReader",
    description:
      "Read with local dictionaries, save words, and review them with spaced repetition.",
    permissions: ["storage", "unlimitedStorage"],
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
              strict_min_version: "140.0",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
