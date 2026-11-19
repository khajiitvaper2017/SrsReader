import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, normalizePath } from "vite";

const iconPath = "../public/icons/128.png";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "shared-favicon",
      apply: "serve",
      transformIndexHtml(html) {
        const file = normalizePath(
          fileURLToPath(new URL(iconPath, import.meta.url)),
        );
        return html.replace(`href="${iconPath}"`, `href="/@fs/${file}"`);
      },
    },
  ],
});
