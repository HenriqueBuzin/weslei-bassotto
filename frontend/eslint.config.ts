import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import type { ESLint } from "eslint";

export default defineConfig([
  globalIgnores(["dist", "coverage", "playwright-report", "test-results", "node_modules"]),
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [js.configs.recommended, reactRefresh.configs.vite],
    plugins: {
      // eslint-plugin-react-hooks types its own `configs` shape in a way that
      // does not line up with ESLint's Plugin type. The cast is the mismatch,
      // not a claim about the plugin working differently.
      "react-hooks": reactHooks as unknown as ESLint.Plugin,
    },
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "e2e/**/*.ts", "*.config.ts", "scripts/**/*.mts", "src/test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    files: ["src/context/AuthContext.tsx", "src/routes/index.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  prettier,
]);
