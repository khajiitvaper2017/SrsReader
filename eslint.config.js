import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      ".output/**",
      ".wxt/**",
      ".test-browser/**",
      "dicts/**",
      "graft/**",
      "public/**",
      "site/dist/**",
      "site/.prerender/**",
    ],
  },
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
);
