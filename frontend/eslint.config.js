import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage", "playwright-report", "test-results", "node_modules"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [js.configs.recommended, reactRefresh.configs.vite],
    plugins: {
      "react-hooks": reactHooks,
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
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["**/*.{test,spec}.{js,jsx}", "e2e/**/*.js", "*.config.js", "eslint.config.js", "src/test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    files: ["src/context/AuthContext.jsx", "src/routes/index.jsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  prettier,
]);
