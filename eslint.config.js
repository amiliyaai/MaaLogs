import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "node_modules/**",
      "vscode/out/**",
      "commitlint.config.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  sonarjs.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": "warn",
      "no-useless-assignment": "warn",
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "sonarjs/unused-import": "off",
    },
  },
  {
    files: ["vscode/**"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/regex-complexity": "off",
      "sonarjs/slow-regex": "off",
      "sonarjs/no-unused-collection": "off",
      "sonarjs/unused-import": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/domains/logs/utils/**/*.ts"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/regex-complexity": "off",
      "sonarjs/slow-regex": "off",
      "sonarjs/no-collection-size-mischeck": "off",
      "sonarjs/no-invariant-returns": "off",
      "sonarjs/no-ignored-exceptions": "off",
      "sonarjs/duplicates-in-character-class": "off",
    },
  },
  {
    files: ["src/domains/logs/composables/**/*.ts"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
    },
  },
  {
    files: ["src/domains/logs/parsers/**/*.ts"],
    rules: {
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/regex-complexity": "off",
      "sonarjs/slow-regex": "off",
      "sonarjs/no-nested-template-literals": "off",
      "sonarjs/todo-tag": "off",
    },
  },
  {
    files: ["src/App.vue"],
    rules: {
      "sonarjs/slow-regex": "off",
      "sonarjs/pseudo-random": "off",
    },
  },
  {
    files: ["src/domains/logs/types/logTypes.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
