import { defineConfig } from "wxt";
import config from "./wxt.config";

export default defineConfig({
  ...config,
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}-store",
  zip: {
    ...config.zip,
    artifactTemplate: "{{name}}-{{version}}-{{browser}}-store.zip",
  },
  hooks: {
    ...config.hooks,
    "build:manifestGenerated"(_wxt, manifest) {
      delete manifest.key;
    },
  },
});
