import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import fmarkTheme from "./eslint-rules/no-raw-style-colors.js";
import noLooseString from "./eslint-rules/no-loose-string.cjs";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "fmark-rules": {
        rules: {
          "no-loose-string": noLooseString,
        },
      },
      "fmark-theme": fmarkTheme,
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      "fmark-rules/no-loose-string": "error",
      "fmark-theme/no-raw-style-colors": "error",
    },
  },
);
